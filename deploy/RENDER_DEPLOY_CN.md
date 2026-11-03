# RecallCode 免费公网部署（Render + 持久化 PostgreSQL）

**状态说明**：本项目具备真实用户注册、服务端学习记录及多用户隔离。完成下面的账号授权和资源创建后，才能获得真正可访问的 `https://<你的服务名>.onrender.com`。源码中的 `render.yaml` 仅定义部署方式，**不是已经上线的证明**。

## 第 1 步：将源码放到独立 GitHub 仓库

1. 登录 GitHub，进入 https://github.com/new 。Repository name 填 `recallcode`，选择 Private 或 Public（Render 需要被授权读取私有仓库），创建**空仓库**；不要勾选 README、license 或 .gitignore。
2. 在本机解压最新版 `RecallCode_Render_Ready.zip`，进入其中 `recallcode-app` 目录。
3. 在这个目录执行（GitHub 登录以你的电脑上的 Git 凭据为准）：

```bash
git init
git add .
git commit -m "Deploy RecallCode to Render"
git branch -M main
git remote add origin https://github.com/<你的GitHub用户名>/recallcode.git
git push -u origin main
```

不要上传 `.env` 或数据库文件。项目已包含 `.gitignore`，可用 `git status` 验证。

## 第 2 步：创建可持久化的 PostgreSQL

**不要将 SQLite 数据库文件放在 Render 免费 Web 服务上**：免费实例的磁盘文件会随休眠/重启/更新丢失。Render 免费 PostgreSQL 数据库也只保留 30 天，并不适合作为长期用户数据存储。

可以创建一个 Neon Free PostgreSQL 项目（https://console.neon.tech/），在 Connect 面板复制带 SSL 的 PostgreSQL **连接字符串**，通常形如：

`postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require`

切勿公开分享连接字符串，尤其不能提交到 GitHub 或聊天截图中。项目启动时会自动将 `postgresql://` / `postgres://` 规范化为 SQLAlchemy 使用的 `postgresql+psycopg://`，支持 psycopg 3。

Neon Free 存储和用量有上限，免费不意味着高可用生产 SLA。重要用户数据应配备独立备份与恢复演练。

## 第 3 步：在 Render 创建 Web Service

1. 在 https://dashboard.render.com/ 登录并关联有上述仓库访问权限的 GitHub 账户。
2. 选择 **New → Blueprint**，选择 `recallcode` 仓库。Render 会读取仓库根目录下的 `render.yaml`。
3. 选择 Free Web Service，系统应读取 `runtime: docker` 和 `healthCheckPath: /api/health`。
4. 在创建页面填写 `DATABASE_URL` **密钥值**：粘贴上一步的 Neon PostgreSQL 连接字符串（只填在 Render 的私有环境变量管理界面）。
5. 确保以下环境变量已由 Blueprint 提供：`APP_ENV=production`、`COOKIE_SECURE=true`。无需设置 `PUBLIC_ORIGIN`，应用会读取 Render 自动提供的 `RENDER_EXTERNAL_URL`；使用自定义域名时应明确配置 `PUBLIC_ORIGIN=https://你的域名`。
6. 确认创建并等待部署结果。在 Render 的 Deploys / Logs 页面检查启动异常。**不要将免费数据库误当成长期持久化方案。**

如果选用 **New → Web Service** 而不是 Blueprint，也可以关联此仓库，Runtime 选 Docker，plan 选 Free；手动补齐同样三个环境变量及 `/api/health` 健康检查。

## 第 4 步：公网验证

Render 分配的公网地址一般为：

`https://<服务名>.onrender.com`

执行：

```bash
curl https://<服务名>.onrender.com/api/health
```

应该返回 `{"ok":true}`；如果返回 503，优先检查 PostgreSQL 连接。用浏览器打开首页并创建**测试账户**，完成登录、导入题单、评分，刷新页面确认学习记录仍在。建议使用另外一个账户重复操作，检查用户数据相互隔离。

也可以运行本仓库的检测脚本：

```bash
python deploy/verify_public.py https://<服务名>.onrender.com
```

该脚本只测试健康检查及首页资源，不会创建用户或修改数据。

## 已知限制与上线安全

- 目前不支持自动获取任意力扣公开题单的真实内容；URL 导入需要合法授权的解析服务。批量粘贴题号/题目 URL 可使用。
- 当前登录流程未完成邮箱验证、密码找回、账户删除及分布式限流。**建议先小规模内测，不要在补全安全措施前大规模公开开放注册。**
- 目前使用 `Base.metadata.create_all` 在启动时初始化新表；后续改表需引入 Alembic 迁移与数据库备份。
- Render Free Web Service 会休眠，唤醒时存在延迟，并有流量和运行时间限制。
- 定期备份 PostgreSQL，至少验证一次可恢复性；免费数据库服务不是自动备份的替代品。

## 后续更新

在本地修改代码、测试后执行 `git add/commit/push`，Render 通常会根据仓库配置自动重新部署。应用和数据库分离，正常的应用重建不会清空 Neon 数据库；但数据库结构升级需提前迁移。
