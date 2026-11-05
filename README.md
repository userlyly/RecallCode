# RecallCode

每天练一点，让做过的算法题真正记得住。

**[下载插件](https://github.com/userlyly/RecallCode/releases/download/v2.0.0/recallcode-v2.zip)** · [安装说明](#一分钟安装) · [反馈问题](https://github.com/userlyly/RecallCode/issues)

![RecallCode](docs/images/hero.png)

## 刷过的题，怎么又忘了？

想象一下，你准备找一份计算机相关的实习，发现面试要「手撕算法」，你慌了。赶紧打开力扣，连刷几天，感觉自己又行了。结果隔了一周再看——“这题我做过，但怎么写来着？”

**RecallCode 就是陪你刷题、帮你安排复习的搭子。** 选好题单，每天打开侧栏，今天练什么一眼就能看到。做完一道题，在力扣「提交」旁点开 RecallCode，记下思路，再用 😭 😰 🙂 😁 评价一下，系统就会根据你的掌握情况安排下次复习。忙了几天也没关系，回来后按每天的题量慢慢接着练。

内置 **热题 100、面试经典 150、SQL 50**，也能导入自己的题单。同一道题的进度跨题单共享。**免登录，本机保存**，练了多少、什么时候练的，都能在学习日历里看到。

## 一分钟安装

1. **[下载 recallcode-v2.zip](https://github.com/userlyly/RecallCode/releases/download/v2.0.0/recallcode-v2.zip)**，解压到一个固定文件夹。
2. 桌面 Chrome 打开 <code>chrome://extensions</code>，开启右上角「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择解压后包含 **manifest.json** 的文件夹。
4. 在扩展菜单里固定 RecallCode，点击图标打开侧栏，跟着首次引导开始。已经打开的力扣题页刷新一下即可。

请保留解压文件夹，浏览器会从这里加载插件。

## 每天怎么用？

1. **选题单**。在「我的题单」选择想练的题单，点击「点击参与今日计划」。
2. **开始练**。在「今日计划」点击「练习新题」或「回顾旧题」，自动打开待练习的力扣题目。
3. **记下来**。在题页的 RecallCode 面板计时、写笔记、评分并保存。下次复习会自动安排。

默认每天 2 道新题、最多 10 道复习，可在设置里调整。学习记录支持 JSON 导出与恢复，记得定期备份。

<details>
<summary>📸 看看实际界面</summary>

<table>
  <tr>
    <td align="center"><b>今日计划</b></td>
    <td align="center"><b>我的题单</b></td>
    <td align="center"><b>学习日历</b></td>
  </tr>
  <tr>
    <td><img src="docs/images/today.png" width="250" alt="今日计划"></td>
    <td><img src="docs/images/library.png" width="250" alt="我的题单"></td>
    <td><img src="docs/images/analytics.png" width="250" alt="学习日历"></td>
  </tr>
</table>

![力扣题页里的计时、笔记和四档评分](docs/images/leetcode-training.png)

截图来自真实插件，封面为 AI 插画。

</details>

当前主要支持 **桌面 Chrome + 力扣中国站**。国际站完整流程和 Edge 仍待验证。公开题单读取失败时，可改用批量粘贴导入。

源码构建、备份迁移和技术细节见 [详细文档](extension/README.md)，旧版网站见 [v1 文档](docs/RECALLCODE_V1_WEB.md)。

觉得好用的话，欢迎点个 **Star ⭐**，让更多刷题搭子发现 RecallCode。
