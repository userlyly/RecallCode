"""RecallCode multi-user backend. All user-specific objects are scoped to current user.
Run locally: DATABASE_URL=sqlite:///./recallcode.db uvicorn app.main:app --reload
"""
from __future__ import annotations
import hashlib
import json
import os
import re
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError
from fastapi import FastAPI, Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import (create_engine, ForeignKey, String, Integer, DateTime, Date, Boolean,
                        UniqueConstraint, Text, select, func, delete)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker, Session

ROOT=Path(__file__).resolve().parent
DATABASE_URL=os.environ.get('DATABASE_URL','sqlite:///./recallcode.db')
# Cloud providers often return postgres:// or postgresql:// URLs; SQLAlchemy must use psycopg 3.
if DATABASE_URL.startswith('postgres://'):
    DATABASE_URL='postgresql+psycopg://'+DATABASE_URL[len('postgres://'):]
elif DATABASE_URL.startswith('postgresql://'):
    DATABASE_URL='postgresql+psycopg://'+DATABASE_URL[len('postgresql://'):]
IS_SQLITE=DATABASE_URL.startswith('sqlite')
if os.environ.get('APP_ENV')=='production' and IS_SQLITE:
    raise RuntimeError('Production deployment requires DATABASE_URL with a persistent PostgreSQL database; refusing ephemeral SQLite.')
engine=create_engine(DATABASE_URL,connect_args={'check_same_thread':False,'timeout':30} if IS_SQLITE else {},pool_pre_ping=True)
SessionLocal=sessionmaker(bind=engine,expire_on_commit=False)
PH=PasswordHasher(time_cost=2,memory_cost=19456,parallelism=1)
COOKIE_SECURE=os.environ.get('COOKIE_SECURE','false').lower()=='true'
# Render provides a stable HTTPS origin automatically; explicit PUBLIC_ORIGIN overrides it.
PUBLIC_ORIGIN=(os.environ.get('PUBLIC_ORIGIN') or os.environ.get('RENDER_EXTERNAL_URL') or 'http://localhost:8000').rstrip('/')
RESOLVER_URL=os.environ.get('LIST_RESOLVER_URL','').strip()
RESOLVER_TOKEN=os.environ.get('LIST_RESOLVER_TOKEN','').strip()
DAYS_SESSION=14
MAX_ITEMS=1000

class Base(DeclarativeBase):pass
class User(Base):
    __tablename__='users'
    id:Mapped[str]=mapped_column(String(36),primary_key=True)
    email:Mapped[str]=mapped_column(String(254),unique=True,index=True)
    password_hash:Mapped[str]=mapped_column(String(255))
    name:Mapped[str]=mapped_column(String(80))
    time_zone:Mapped[str]=mapped_column(String(80),default='Asia/Shanghai')
    budget:Mapped[int]=mapped_column(Integer,default=30)
    new_limit:Mapped[int]=mapped_column(Integer,default=2)
    focus:Mapped[str]=mapped_column(String(12),default='balanced')
    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),default=lambda:datetime.now(timezone.utc))
class AuthSession(Base):
    __tablename__='auth_sessions'
    token_hash:Mapped[str]=mapped_column(String(64),primary_key=True)
    user_id:Mapped[str]=mapped_column(ForeignKey('users.id',ondelete='CASCADE'),index=True)
    csrf:Mapped[str]=mapped_column(String(64))
    expires_at:Mapped[datetime]=mapped_column(DateTime(timezone=True))
class Problem(Base):
    __tablename__='problems'
    key:Mapped[str]=mapped_column(String(160),primary_key=True)
    number:Mapped[int|None]=mapped_column(Integer,nullable=True)
    title:Mapped[str]=mapped_column(String(240))
    slug:Mapped[str|None]=mapped_column(String(140),nullable=True)
    difficulty:Mapped[str]=mapped_column(String(16),default='Unknown')
    topic:Mapped[str]=mapped_column(String(60),default='未分类')
    minutes:Mapped[int]=mapped_column(Integer,default=12)
    url:Mapped[str|None]=mapped_column(String(500),nullable=True)
class StudyList(Base):
    __tablename__='study_lists'
    id:Mapped[str]=mapped_column(String(36),primary_key=True)
    user_id:Mapped[str]=mapped_column(ForeignKey('users.id',ondelete='CASCADE'),index=True)
    name:Mapped[str]=mapped_column(String(100))
    source_url:Mapped[str|None]=mapped_column(String(500),nullable=True)
    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),default=lambda:datetime.now(timezone.utc))
    __table_args__=(UniqueConstraint('user_id','name',name='uq_list_user_name'),)
class ListItem(Base):
    __tablename__='list_items'
    list_id:Mapped[str]=mapped_column(ForeignKey('study_lists.id',ondelete='CASCADE'),primary_key=True)
    problem_key:Mapped[str]=mapped_column(ForeignKey('problems.key'),primary_key=True)
    order:Mapped[int]=mapped_column(Integer,default=0)
class Progress(Base):
    __tablename__='progress'
    user_id:Mapped[str]=mapped_column(ForeignKey('users.id',ondelete='CASCADE'),primary_key=True)
    problem_key:Mapped[str]=mapped_column(ForeignKey('problems.key'),primary_key=True)
    prior:Mapped[bool]=mapped_column(Boolean,default=False)
    rating:Mapped[str|None]=mapped_column(String(12),nullable=True)
    interval_days:Mapped[int]=mapped_column(Integer,default=0)
    streak:Mapped[int]=mapped_column(Integer,default=0)
    next_due:Mapped[date|None]=mapped_column(Date,nullable=True)
    last_review:Mapped[datetime|None]=mapped_column(DateTime(timezone=True),nullable=True)
    note:Mapped[str]=mapped_column(Text,default='')
class Review(Base):
    __tablename__='reviews'
    id:Mapped[str]=mapped_column(String(36),primary_key=True)
    user_id:Mapped[str]=mapped_column(ForeignKey('users.id',ondelete='CASCADE'),index=True)
    problem_key:Mapped[str]=mapped_column(ForeignKey('problems.key'))
    rating:Mapped[str]=mapped_column(String(12))
    kind:Mapped[str]=mapped_column(String(12))
    seconds:Mapped[int|None]=mapped_column(Integer,nullable=True)
    used_hint:Mapped[bool]=mapped_column(Boolean,default=False)
    passed:Mapped[bool|None]=mapped_column(Boolean,nullable=True)
    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),default=lambda:datetime.now(timezone.utc))

app=FastAPI(title='RecallCode API',version='1.0.0',docs_url='/api/docs' if os.environ.get('APP_ENV')!='production' else None)
app.mount('/static',StaticFiles(directory=ROOT/'static'),name='static')

@app.on_event('startup')
def init_db():
    Base.metadata.create_all(engine)
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert
    catalog=json.loads((ROOT/'catalog.json').read_text(encoding='utf-8'))
    with SessionLocal() as db:
        for row in catalog:
            if not db.get(Problem,row['key']):db.add(Problem(**row))
        db.commit()

@app.middleware('http')
async def basic_security(request:Request,call_next):
    if request.method in ('POST','PUT','PATCH','DELETE'):
        origin=request.headers.get('origin')
        if origin and origin.rstrip('/')!=PUBLIC_ORIGIN and origin.rstrip('/')!=str(request.base_url).rstrip('/'):
            return Response('Cross-origin mutation blocked',status_code=403)
    result=await call_next(request)
    result.headers['X-Content-Type-Options']='nosniff'
    result.headers['Referrer-Policy']='strict-origin-when-cross-origin'
    result.headers['X-Frame-Options']='DENY'
    result.headers['Permissions-Policy']='camera=(), microphone=(), geolocation=()'
    result.headers['Content-Security-Policy']="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    return result

def now():return datetime.now(timezone.utc)
def db_dep():
    with SessionLocal() as session: yield session

def today(user:User)->date:
    try:return datetime.now(ZoneInfo(user.time_zone)).date()
    except (ZoneInfoNotFoundError,KeyError):return datetime.now(timezone.utc).date()

def who(request:Request,db:Session=Depends(db_dep)) -> User:
    raw=request.cookies.get('rc_session')
    if not raw:raise HTTPException(401,'请先登录')
    s=db.get(AuthSession,hashlib.sha256(raw.encode()).hexdigest())
    if not s or s.expires_at.replace(tzinfo=timezone.utc)<now():raise HTTPException(401,'登录已过期')
    user=db.get(User,s.user_id)
    if not user:raise HTTPException(401,'用户不存在')
    if request.method in ('POST','PATCH','DELETE','PUT') and request.headers.get('X-CSRF-Token')!=s.csrf:
        raise HTTPException(403,'CSRF token 无效，请刷新页面')
    return user

def new_session(response:Response,user:User,db:Session):
    raw=secrets.token_urlsafe(36)
    sess=AuthSession(token_hash=hashlib.sha256(raw.encode()).hexdigest(),user_id=user.id,csrf=secrets.token_urlsafe(30),expires_at=now()+timedelta(days=DAYS_SESSION))
    db.add(sess);db.commit()
    response.set_cookie('rc_session',raw,max_age=DAYS_SESSION*86400,httponly=True,secure=COOKIE_SECURE,samesite='lax',path='/')

class Credentials(BaseModel):
    email:str=Field(min_length=3,max_length=254)
    password:str=Field(min_length=10,max_length=128)
    @field_validator('email')
    @classmethod
    def check_email(cls,v):
        v=v.strip().lower()
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',v):raise ValueError('邮箱格式不正确')
        return v
class Register(Credentials):
    name:str=Field(min_length=1,max_length=60)
    time_zone:str='Asia/Shanghai'
class SettingsPayload(BaseModel):
    name:str=Field(min_length=1,max_length=60)
    budget:int=Field(ge=10,le=240)
    new_limit:int=Field(ge=0,le=10)
    focus:str=Field(pattern='^(balanced|new|review)$')
    time_zone:str='Asia/Shanghai'
class ListName(BaseModel):name:str=Field(min_length=1,max_length=100)
class ImportItem(BaseModel):
    key:str=Field(max_length=160)
    number:int|None=None
    title:str=Field(min_length=1,max_length=240)
    slug:str|None=Field(default=None,max_length=140)
    difficulty:str='Unknown'
    topic:str='未分类'
    minutes:int=Field(default=12,ge=1,le=90)
    url:str|None=Field(default=None,max_length=500)
class ImportCommit(BaseModel):
    name:str=Field(min_length=1,max_length=100)
    items:list[ImportItem]=Field(min_length=1,max_length=MAX_ITEMS)
    source_url:str|None=None
class PasteInput(BaseModel):
    content:str=Field(min_length=1,max_length=80000)
class UrlInput(BaseModel):url:str=Field(min_length=12,max_length=500)
class PriorBulk(BaseModel):
    keys:list[str]=Field(min_length=1,max_length=MAX_ITEMS)
    prior:bool=True
class ReviewInput(BaseModel):
    key:str
    rating:str=Field(pattern='^(again|hard|good|easy)$')
    seconds:int|None=Field(default=None,ge=0,le=14400)
    used_hint:bool=False
    passed:bool|None=None
class NoteInput(BaseModel):note:str=Field(max_length=10000)

# Small in-process throttle: demonstration safeguard; replace with Redis/edge WAF on public deployment.
login_attempts:dict[str,list[float]]={}
def throttle(request:Request):
    import time
    ip=request.client.host if request.client else 'unknown'
    t=time.monotonic();a=[x for x in login_attempts.get(ip,[]) if t-x<300]
    if len(a)>=25:raise HTTPException(429,'请求过于频繁，请稍后再试')
    a.append(t);login_attempts[ip]=a

@app.post('/api/auth/register')
def register(body:Register,request:Request,response:Response,db:Session=Depends(db_dep)):
    throttle(request)
    if db.scalar(select(User).where(User.email==body.email)):raise HTTPException(409,'该邮箱已注册')
    try:ZoneInfo(body.time_zone)
    except Exception:raise HTTPException(422,'无效的时区')
    user=User(id=str(uuid.uuid4()),email=body.email,name=body.name.strip(),password_hash=PH.hash(body.password),time_zone=body.time_zone)
    db.add(user);db.commit();new_session(response,user,db)
    return {'ok':True}
@app.post('/api/auth/login')
def login(body:Credentials,request:Request,response:Response,db:Session=Depends(db_dep)):
    throttle(request)
    user=db.scalar(select(User).where(User.email==body.email))
    if not user:raise HTTPException(401,'邮箱或密码错误')
    try:PH.verify(user.password_hash,body.password)
    except (VerifyMismatchError,VerificationError):raise HTTPException(401,'邮箱或密码错误')
    new_session(response,user,db);return {'ok':True}
@app.post('/api/auth/logout')
def logout(request:Request,response:Response,user:User=Depends(who),db:Session=Depends(db_dep)):
    raw=request.cookies.get('rc_session')
    if raw:db.execute(delete(AuthSession).where(AuthSession.token_hash==hashlib.sha256(raw.encode()).hexdigest()))
    db.commit();response.delete_cookie('rc_session',path='/');return {'ok':True}
@app.get('/api/me')
def me(request:Request,user:User=Depends(who),db:Session=Depends(db_dep)):
    raw=request.cookies.get('rc_session');sess=db.get(AuthSession,hashlib.sha256(raw.encode()).hexdigest())
    return {'id':user.id,'email':user.email,'name':user.name,'csrf':sess.csrf,'budget':user.budget,'new_limit':user.new_limit,'focus':user.focus,'time_zone':user.time_zone}
@app.patch('/api/me')
def change_me(body:SettingsPayload,user:User=Depends(who),db:Session=Depends(db_dep)):
    try:ZoneInfo(body.time_zone)
    except Exception:raise HTTPException(422,'无效的时区')
    user.name=body.name.strip();user.budget=body.budget;user.new_limit=body.new_limit;user.focus=body.focus;user.time_zone=body.time_zone
    db.commit();return {'ok':True}

def owned_keys(db:Session,uid:str)->list[str]:
    return list(db.scalars(select(ListItem.problem_key).join(StudyList,StudyList.id==ListItem.list_id).where(StudyList.user_id==uid).distinct()))
def load_records(db:Session,user:User):
    keys=owned_keys(db,user.id)
    if not keys:return [],{}
    problems=list(db.scalars(select(Problem).where(Problem.key.in_(keys))))
    pp={r.problem_key:r for r in db.scalars(select(Progress).where(Progress.user_id==user.id,Progress.problem_key.in_(keys)))}
    return problems,pp

def pview(p:Problem,progress:Progress|None=None):
    return {'key':p.key,'number':p.number,'title':p.title,'slug':p.slug,'difficulty':p.difficulty,'topic':p.topic,'minutes':p.minutes,'url':p.url,
      'state': ('unseen' if not progress else 'rated' if progress.rating else 'prior' if progress.prior else 'unseen'),
      'rating':progress.rating if progress else None,'next_due':progress.next_due.isoformat() if progress and progress.next_due else None,
      'note':progress.note if progress else '', 'streak':progress.streak if progress else 0,
      'last_review':progress.last_review.isoformat() if progress and progress.last_review else None}

def priority(p:dict,d:date):
    r={'again':40,'hard':28,'good':13,'easy':5}.get(p['rating'],0)
    overdue=(d-date.fromisoformat(p['next_due'])).days if p['next_due'] else 0
    return r+min(30,max(overdue,0))*2

def planning(rows:list[dict],user:User,today_date:date,budget:int|None=None):
    budget=budget if budget is not None else user.budget
    due=sorted([p for p in rows if p['next_due'] and date.fromisoformat(p['next_due'])<=today_date],key=lambda p:-priority(p,today_date))
    pending=[p for p in rows if p['state']=='prior']
    new=[p for p in rows if p['state']=='unseen']
    # deterministic ordering for a stable daily plan
    new.sort(key=lambda p:({'Easy':0,'Medium':1,'Hard':2}.get(p['difficulty'],3),p.get('number') or 100000))
    arr=[];used=0
    def add(pool,limit=100):
        nonlocal used
        for p in pool:
            if limit<=0 or len(arr)>=10:break
            if p['key'] in {x['key'] for x in arr}:continue
            if used+p['minutes']<=budget:
                out=dict(p);out['task_type']='review' if p in due else 'assess' if p in pending else 'new';arr.append(out);used+=p['minutes'];limit-=1
    if user.focus=='new':add(new,user.new_limit);add(due);add(pending)
    elif user.focus=='review':add(due);add(pending);add(new,max(0,user.new_limit-1))
    else:add(due);add(pending,2);add(new,user.new_limit);add(pending)
    if not arr:
        choice=sorted(due+pending+new,key=lambda p:p['minutes'])
        if choice:
            p=choice[0];a=dict(p);a['task_type']='review' if p in due else 'assess' if p in pending else 'new';arr.append(a);used=p['minutes']
    return arr,used,due,pending,new

@app.get('/api/dashboard')
def dashboard(user:User=Depends(who),db:Session=Depends(db_dep),budget:int|None=None):
    if budget is not None and not 10<=budget<=240:raise HTTPException(422,'时间预算应在 10–240 分钟之间')
    problems,pr=load_records(db,user);rows=[pview(p,pr.get(p.key)) for p in problems]
    t=today(user);arr,used,due,pending,new=planning(rows,user,t,budget)
    mastered=sum(p['rating'] in ('good','easy') for p in rows)
    return {'today':t.isoformat(),'stats':{'total':len(rows),'learned':sum(p['state']=='rated' for p in rows),'prior':len(pending),'unseen':len(new),'due':len(due),'mastered':mastered},'plan':arr,'used_minutes':used,'due':due,'assessment':pending,'new':new}

@app.get('/api/lists')
def lists(user:User=Depends(who),db:Session=Depends(db_dep)):
    res=[]
    for row in db.scalars(select(StudyList).where(StudyList.user_id==user.id).order_by(StudyList.created_at.desc())):
        keys=list(db.scalars(select(ListItem.problem_key).where(ListItem.list_id==row.id)))
        pr={p.problem_key:p for p in db.scalars(select(Progress).where(Progress.user_id==user.id,Progress.problem_key.in_(keys)))} if keys else {}
        res.append({'id':row.id,'name':row.name,'source_url':row.source_url,'total':len(keys),'learned':sum(bool(pr.get(k) and pr[k].rating) for k in keys),'prior':sum(bool(pr.get(k) and pr[k].prior and not pr[k].rating) for k in keys)})
    return {'lists':res}
@app.get('/api/problems')
def problems_endpoint(list_id:str|None=None,user:User=Depends(who),db:Session=Depends(db_dep)):
    if list_id:
        lst=db.scalar(select(StudyList).where(StudyList.id==list_id,StudyList.user_id==user.id))
        if not lst:raise HTTPException(404,'题单不存在')
        keys=list(db.scalars(select(ListItem.problem_key).where(ListItem.list_id==list_id).order_by(ListItem.order)))
    else:keys=owned_keys(db,user.id)
    if not keys:return {'problems':[]}
    pp={x.key:x for x in db.scalars(select(Problem).where(Problem.key.in_(keys)))}
    prog={p.problem_key:p for p in db.scalars(select(Progress).where(Progress.user_id==user.id,Progress.problem_key.in_(keys)))}
    return {'problems':[pview(pp[k],prog.get(k)) for k in keys if k in pp]}
@app.patch('/api/lists/{list_id}')
def rename_list(list_id:str,body:ListName,user:User=Depends(who),db:Session=Depends(db_dep)):
    x=db.scalar(select(StudyList).where(StudyList.id==list_id,StudyList.user_id==user.id))
    if not x:raise HTTPException(404,'题单不存在')
    name=body.name.strip()
    if not name:raise HTTPException(422,'名称不能为空')
    other=db.scalar(select(StudyList).where(StudyList.user_id==user.id,StudyList.name==name,StudyList.id!=list_id))
    if other:raise HTTPException(409,'已有同名题单')
    x.name=name;db.commit();return {'ok':True}
@app.delete('/api/lists/{list_id}')
def remove_list(list_id:str,user:User=Depends(who),db:Session=Depends(db_dep)):
    x=db.scalar(select(StudyList).where(StudyList.id==list_id,StudyList.user_id==user.id))
    if not x:raise HTTPException(404,'题单不存在')
    db.execute(delete(ListItem).where(ListItem.list_id==list_id));db.delete(x);db.commit();return {'ok':True,'message':'题单已删除，其他题单共享的学习记录仍保留'}

CATALOG=json.loads((ROOT/'catalog.json').read_text(encoding='utf-8'))
BY_NUMBER={str(x['number']):x for x in CATALOG}
BY_SLUG={x['slug']:x for x in CATALOG}
PRESETS={'curated':{'name':'热门算法精选（80题）','items':CATALOG},'binary':{'name':'二分查找专项','items':[x for x in CATALOG if x['topic']=='二分查找']},'linked':{'name':'链表专项','items':[x for x in CATALOG if x['topic']=='链表']}}
# Strictly no claimed 100-question "Hot100" from an incomplete curated 80-question dataset.
@app.get('/api/presets')
def presets():return {'presets':[{'id':k,'name':v['name'],'count':len(v['items'])} for k,v in PRESETS.items()]}
@app.get('/api/presets/{preset_id}')
def preset_data(preset_id:str):
    v=PRESETS.get(preset_id)
    if not v:raise HTTPException(404,'预置题单不存在')
    return {'name':v['name'],'items':v['items'],'source':'curated'}

def url_as_item(x:str):
    x=x.strip().rstrip('.,;，；')
    u=urlparse(x)
    host=(u.hostname or '').lower()
    if host not in ('leetcode.cn','www.leetcode.cn','leetcode.com','www.leetcode.com') or u.scheme not in ('https','http'):
        return None
    match=re.match(r'^/problems/([a-z0-9-]+)/?$',u.path)
    if not match:return None
    slug=match.group(1)
    if slug in BY_SLUG:return BY_SLUG[slug]
    return {'key':'slug:'+slug,'number':None,'title':slug.replace('-',' ').title(),'slug':slug,'difficulty':'Unknown','topic':'未分类','minutes':12,'url':f'https://{host}/problems/{slug}/'}

def parse_lines(content:str):
    # Explicit user-provided list; no remote crawling or private API assumptions.
    pieces=re.split(r'[\n\r,，;；\t]+',content)
    items=[];seen=set();bad=[]
    for piece in pieces:
        line=piece.strip()
        if not line:continue
        x=url_as_item(line)
        if not x:
            match=re.fullmatch(r'(?:#\s*)?(\d{1,6})(?:\s*[.、]\s*[^\n]*)?',line)
            if match:
                n=match.group(1)
                x=BY_NUMBER.get(n) or {'key':'lc:'+n,'number':int(n),'title':'题目 #'+n+'（待补充标题）','slug':None,'difficulty':'Unknown','topic':'未分类','minutes':12,'url':None}
        if x:
            if x['key'] not in seen:items.append(x);seen.add(x['key'])
        else:bad.append(line[:120])
        if len(items)>MAX_ITEMS:raise HTTPException(422,f'单次最多导入 {MAX_ITEMS} 道题')
    return items,bad
@app.post('/api/import/parse')
def import_parse(body:PasteInput,user:User=Depends(who)):
    items,bad=parse_lines(body.content)
    return {'items':items,'unrecognized':bad[:30],'unrecognized_count':len(bad)}
@app.post('/api/import/url')
def import_url(body:UrlInput,user:User=Depends(who)):
    u=urlparse(body.url)
    if u.scheme!='https' or u.hostname not in ('leetcode.cn','www.leetcode.cn','leetcode.com','www.leetcode.com'):
        raise HTTPException(422,'只接受 HTTPS 力扣公开题单链接')
    if not re.match(r'^/(?:studyplan|problem-list)/[a-zA-Z0-9-]+/?$',u.path):
        raise HTTPException(422,'这不是可识别的力扣公开题单链接')
    if not RESOLVER_URL:
        raise HTTPException(422,'尚未配置经过授权的力扣题单数据接入。可将公开题单中的题目编号或链接批量粘贴导入；系统不会假装读取成功。')
    # Resolver URL is deployment-controlled, not user-controlled (avoid SSRF).
    try:
        headers={'Authorization':f'Bearer {RESOLVER_TOKEN}'} if RESOLVER_TOKEN else {}
        with httpx.Client(timeout=15,follow_redirects=False) as client:
            response=client.post(RESOLVER_URL,json={'url':body.url},headers=headers)
            response.raise_for_status();payload=response.json()
        raw=payload.get('questions',[])
        if not isinstance(raw,list) or not raw or len(raw)>MAX_ITEMS:raise ValueError('未返回完整的题目数组')
        clean=[ImportItem.model_validate(q).model_dump() for q in raw]
        if not payload.get('complete',False):raise ValueError('解析结果未标记为完整，拒绝导入')
        return {'name':str(payload.get('name') or '导入题单')[:100],'items':clean,'source':'authorized_resolver','source_url':body.url}
    except (httpx.HTTPError,ValueError,KeyError) as exc:
        raise HTTPException(422,f'授权解析器未能完整读取题单：{str(exc)[:160]}')

@app.post('/api/import/commit')
def import_commit(body:ImportCommit,user:User=Depends(who),db:Session=Depends(db_dep)):
    name=body.name.strip()
    if not name:raise HTTPException(422,'名称不能为空')
    if db.scalar(select(StudyList).where(StudyList.user_id==user.id,StudyList.name==name)):
        raise HTTPException(409,'已有同名题单，请修改名称')
    if body.source_url:
        u=urlparse(body.source_url)
        if u.scheme!='https' or u.hostname not in ('leetcode.cn','www.leetcode.cn','leetcode.com','www.leetcode.com'):
            raise HTTPException(422,'不允许保存非力扣题单来源网址')
    dedup={}
    for item in body.items:
        key=item.key.strip()
        if not re.fullmatch(r'(?:lc:\d{1,6}|slug:[a-z0-9-]{1,130})',key):raise HTTPException(422,'题目标识无效')
        if item.url and not url_as_item(item.url):raise HTTPException(422,'题目链接不是合法的力扣题目地址')
        dedup.setdefault(key,item)
    if not dedup:raise HTTPException(422,'没有可导入题目')
    l=StudyList(id=str(uuid.uuid4()),name=name,user_id=user.id,source_url=body.source_url)
    db.add(l)
    for i,(key,item) in enumerate(dedup.items()):
        if not db.get(Problem,key):
            db.add(Problem(**item.model_dump()))
        db.add(ListItem(list_id=l.id,problem_key=key,order=i))
    db.commit();return {'id':l.id,'count':len(dedup),'name':name}

@app.post('/api/progress/prior')
def set_prior(body:PriorBulk,user:User=Depends(who),db:Session=Depends(db_dep)):
    valid=set(owned_keys(db,user.id));bad=set(body.keys)-valid
    if bad:raise HTTPException(403,'包含不属于你题单的题目')
    changed=0
    for key in set(body.keys):
        p=db.get(Progress,(user.id,key))
        if not p:p=Progress(user_id=user.id,problem_key=key);db.add(p)
        # Don't overwrite real review ratings when importing prior experience.
        if p.rating is None:p.prior=body.prior;changed+=1
    db.commit();return {'ok':True,'changed':changed}

@app.post('/api/reviews')
def post_review(body:ReviewInput,user:User=Depends(who),db:Session=Depends(db_dep)):
    if body.key not in set(owned_keys(db,user.id)):raise HTTPException(403,'请先将这道题加入自己的题单')
    p=db.get(Progress,(user.id,body.key))
    if not p:p=Progress(user_id=user.id,problem_key=body.key);db.add(p)
    kind='review' if p.rating else 'assess' if p.prior else 'new'
    p.streak=p.streak+1 if body.rating in ('good','easy') else 0
    if body.rating=='again':interval=1
    elif body.rating=='hard':interval=2
    elif body.rating=='good':interval=min(90,max(3,round(p.interval_days*1.9)))
    else:interval=min(180,max(7,round(p.interval_days*2.5)))
    p.rating=body.rating;p.interval_days=interval;p.next_due=today(user)+timedelta(days=interval);p.last_review=now();p.prior=True
    db.add(Review(id=str(uuid.uuid4()),user_id=user.id,problem_key=body.key,rating=body.rating,kind=kind,seconds=body.seconds,used_hint=body.used_hint,passed=body.passed))
    db.commit();return {'ok':True,'next_due':p.next_due.isoformat(),'interval_days':interval,'kind':kind}
@app.patch('/api/progress/{key:path}/note')
def update_note(key:str,body:NoteInput,user:User=Depends(who),db:Session=Depends(db_dep)):
    if key not in set(owned_keys(db,user.id)):raise HTTPException(403,'题目不属于当前用户')
    p=db.get(Progress,(user.id,key))
    if not p:p=Progress(user_id=user.id,problem_key=key);db.add(p)
    p.note=body.note;db.commit();return {'ok':True}

@app.get('/api/analytics')
def analytics(user:User=Depends(who),db:Session=Depends(db_dep)):
    problems,prog=load_records(db,user)
    rows=[pview(p,prog.get(p.key)) for p in problems]
    categories={}
    for p in rows:
        x=categories.setdefault(p['topic'],{'total':0,'learned':0,'mastered':0,'prior':0})
        x['total']+=1;x['learned']+=p['state']=='rated';x['mastered']+=p['rating'] in ('good','easy');x['prior']+=p['state']=='prior'
    reviews=list(db.scalars(select(Review).where(Review.user_id==user.id).order_by(Review.created_at.desc()).limit(500)))
    history=[{'problem_key':x.problem_key,'rating':x.rating,'kind':x.kind,'seconds':x.seconds,'used_hint':x.used_hint,'date':x.created_at.isoformat()} for x in reviews]
    return {'categories':categories,'reviews':history,'total_reviews':db.scalar(select(func.count()).select_from(Review).where(Review.user_id==user.id))}
@app.get('/api/export')
def export_data(user:User=Depends(who),db:Session=Depends(db_dep)):
    # Portable backup, deliberately excludes password/session tokens.
    li=lists(user,db);data=problems_endpoint(None,user,db);an=analytics(user,db)
    return {'version':1,'exported_at':now().isoformat(),'profile':{'email':user.email,'name':user.name},'lists':li['lists'],'problems':data['problems'],'reviews':an['reviews']}

@app.get('/api/health')
def health(db:Session=Depends(db_dep)):
    # Readiness must include the database, not merely the HTTP worker.
    try:
        db.execute(select(1))
    except Exception:
        raise HTTPException(503,'数据库暂不可用')
    return {'ok':True}
@app.get('/')
def index():return FileResponse(ROOT/'static'/'index.html')
@app.get('/{rest:path}',include_in_schema=False)
def spa_fallback(rest:str):
    if rest.startswith('api/'):raise HTTPException(404,'未找到接口')
    return FileResponse(ROOT/'static'/'index.html')
