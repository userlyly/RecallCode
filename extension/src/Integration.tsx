import { useState } from "react";
import { preferences, savePreferences } from "./storage/db";
export function Integration() {
  const [status, setStatus] = useState("");
  const enable = async () => {
    try {
      if (
        !(await chrome.permissions.request({
          origins: ["https://leetcode.cn/*"],
        }))
      )
        throw Error("未获得力扣站点权限");
      const scripts = await chrome.scripting.getRegisteredContentScripts({
        ids: ["recallcode-inline"],
      });
      if (!scripts.length)
        await chrome.scripting.registerContentScripts([
          {
            id: "recallcode-inline",
            matches: ["https://leetcode.cn/problems/*"],
            js: ["content.js"],
            runAt: "document_idle",
            persistAcrossSessions: true,
          },
        ]);
      await savePreferences({
        ...(await preferences()),
        enableLeetcodeInline: true,
      });
      setStatus("已启用。请刷新已打开的力扣题目页面。");
    } catch (e) {
      setStatus(String(e));
    }
  };
  const disable = async () => {
    try {
      await chrome.scripting.unregisterContentScripts({
        ids: ["recallcode-inline"],
      });
      await savePreferences({
        ...(await preferences()),
        enableLeetcodeInline: false,
      });
      setStatus("已停用。刷新力扣页面后入口消失。");
    } catch (e) {
      setStatus(String(e));
    }
  };
  return (
    <section>
      <h2>力扣页面快捷交互</h2>
      <p>
        仅申请 leetcode.cn
        权限，用于识别当前题目、计时及主动评分。不读取代码、Cookie
        或账号提交记录。
      </p>
      <button onClick={enable}>授权并启用力扣集成</button>
      <button onClick={disable}>停用页面入口</button>
      <p role="status">{status}</p>
    </section>
  );
}
