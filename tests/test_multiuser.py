"""API-level integration tests: actual HTTP cookies, database isolation and import/review lifecycle."""
import os
import uuid
from pathlib import Path
from fastapi.testclient import TestClient

# Isolate tests from developer's database. Set before importing app.main.
DB=Path(__file__).resolve().parent/('test-'+uuid.uuid4().hex+'.db')
os.environ['DATABASE_URL']='sqlite:///'+str(DB)
from app.main import app


def register(client,mail):
    r=client.post('/api/auth/register',json={'name':'测试用户','email':mail,'password':'my-strong-password','time_zone':'Asia/Shanghai'})
    assert r.status_code==200,r.text
    csrf=client.get('/api/me').json()['csrf']
    client.headers.update({'X-CSRF-Token':csrf})


def test_true_multi_user_isolation():
    with TestClient(app) as first, TestClient(app) as second:
        register(first,'first@example.com')
        register(second,'second@example.com')
        assert first.get('/api/dashboard').json()['stats']['total']==0
        preset=first.get('/api/presets/binary').json()
        res=first.post('/api/import/commit',json={'name':'甲用户的二分题单','items':preset['items']})
        assert res.status_code==200,res.text
        list_id=res.json()['id']
        assert first.get('/api/dashboard').json()['stats']['total']>0
        assert second.get('/api/dashboard').json()['stats']['total']==0
        assert second.get('/api/lists').json()['lists']==[]
        assert second.get('/api/problems?list_id='+list_id).status_code==404
        assert second.patch('/api/lists/'+list_id,json={'name':'恶意改名'}).status_code==404
        assert second.delete('/api/lists/'+list_id).status_code==404
        assert second.post('/api/reviews',json={'key':preset['items'][0]['key'],'rating':'easy'}).status_code==403
        assert second.post('/api/progress/prior',json={'keys':[preset['items'][0]['key']]}).status_code==403
        assert first.post('/api/progress/prior',json={'keys':[preset['items'][0]['key']]}).status_code==200
        assert first.get('/api/dashboard').json()['stats']['prior']==1
        r=first.post('/api/reviews',json={'key':preset['items'][0]['key'],'rating':'good','seconds':300,'used_hint':False})
        assert r.status_code==200,r.text
        assert r.json()['kind']=='assess'
        assert first.get('/api/dashboard').json()['stats']['prior']==0
        assert first.get('/api/dashboard').json()['stats']['learned']==1
        assert second.get('/api/analytics').json()['total_reviews']==0
        assert first.get('/api/analytics').json()['total_reviews']==1
        assert first.post('/api/import/commit',json={'name':'甲用户的二分题单','items':preset['items']}).status_code==409
        assert first.patch('/api/lists/'+list_id,json={'name':'改名后'}).status_code==200
        assert any(p['state']=='rated' for p in first.get('/api/problems').json()['problems'])
        # Two lists share global progress; merging lists must not duplicate tracked questions.
        assert first.post('/api/import/commit',json={'name':'另一份相同题目','items':preset['items']}).status_code==200
        assert first.get('/api/dashboard').json()['stats']['total']==len(preset['items'])
        # CSRF check really enforced.
        assert first.post('/api/reviews',json={'key':preset['items'][0]['key'],'rating':'easy'},headers={'X-CSRF-Token':'wrong'}).status_code==403
        # Persistence survives login/logout across sessions.
        assert first.post('/api/auth/logout',json={}).status_code==200
        assert first.get('/api/me').status_code==401
        assert first.post('/api/auth/login',json={'email':'first@example.com','password':'my-strong-password'}).status_code==200
        assert first.get('/api/dashboard').json()['stats']['learned']==1


def test_paste_parser_and_prohibited_url_host():
    with TestClient(app) as c:
        register(c,'paste@example.com')
        resp=c.post('/api/import/parse',json={'content':'1, 3, 35, 1\nhttps://leetcode.cn/problems/binary-search/\nunknown text'})
        assert resp.status_code==200
        assert len(resp.json()['items'])==4
        assert resp.json()['unrecognized_count']==1
        assert c.post('/api/import/url',json={'url':'http://127.0.0.1/admin'}).status_code==422
        assert c.post('/api/import/url',json={'url':'https://leetcode.cn/problem-list/hello/'}).status_code==422

if __name__=='__main__':
    try:
        test_true_multi_user_isolation()
        test_paste_parser_and_prohibited_url_host()
        print('PASS: real multi-user isolation, authenticated review, CSRF, saved progress, URL validation')
    finally:
        # Windows cannot unlink SQLite files while pooled connections stay open.
        from app.main import engine
        engine.dispose()
        DB.unlink(missing_ok=True)
