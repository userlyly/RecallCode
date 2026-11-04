import { pruneOrphans } from "./storage/cleanup";
import { useEffect, useState } from "react";
import { db, defaults, preferences, savePreferences } from "./storage/db";
export function AdvancedSettings() {
  const [prefs, setPrefs] = useState(defaults),
    [status, setStatus] = useState("");
  useEffect(() => {
    preferences().then(setPrefs);
  }, []);
  const save = async () => {
    try {
      await savePreferences({
        ...(await preferences()),
        focus: prefs.focus,
        timezone: prefs.timezone,
        retention: prefs.retention,
        autoReduceNew: prefs.autoReduceNew,
      });
      setStatus("高级设置已保存");
    } catch (e) {
      setStatus(String(e));
    }
  };
  return (
    <section>
      <h2>高级设置</h2>
      <label>
        <input
          type="checkbox"
          checked={prefs.autoReduceNew !== false}
          onChange={(e) =>
            setPrefs({ ...prefs, autoReduceNew: e.target.checked })
          }
        />
        积压时自动减少新题
      </label>
      <label>
        学习偏好
        <select
          value={prefs.focus}
          onChange={(e) =>
            setPrefs({ ...prefs, focus: e.target.value as typeof prefs.focus })
          }
        >
          <option value="balanced">均衡</option>
          <option value="review">偏复习</option>
          <option value="new">偏新题</option>
        </select>
      </label>
      <label>
        时区
        <input
          value={prefs.timezone}
          onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}
        />
      </label>
      <label>
        目标记忆保持率
        <input
          type="number"
          step="0.01"
          min="0.7"
          max="0.99"
          value={prefs.retention}
          onChange={(e) => setPrefs({ ...prefs, retention: +e.target.value })}
        />
      </label>
      <button onClick={save}>保存高级设置</button>
      <p>恢复模式默认暂停新题，优先预算内的到期任务。</p>
      <details>
        <summary>数据清理</summary>
        <p>
          默认保留已删除题单的学习历史。清理孤立题目会永久删除不属于任何题单的题目及其历史。
        </p>
        <button
          onClick={async () => {
            if (confirm("确认永久删除所有孤立题目及其学习历史？请先备份。")) {
              try {
                setStatus(`已清理 ${await pruneOrphans()} 道孤立题目`);
              } catch (e) {
                setStatus(String(e));
              }
            }
          }}
        >
          清理孤立题目
        </button>
        <p>此操作不可撤销，请先导出备份。只影响该浏览器中的插件数据。</p>
        <button
          onClick={async () => {
            if (!confirm("确认清空插件的全部本机数据？请先导出备份。")) return;
            if (prompt("请输入 DELETE 确认清空") !== "DELETE") return;
            try {
              await db.transaction("rw", db.tables, async () => {
                for (const t of db.tables) await t.clear();
              });
              await chrome.storage.local.clear();
              location.reload();
            } catch (e) {
              setStatus(String(e));
            }
          }}
        >
          清空本地全部数据
        </button>
      </details>
      <p role="status">{status}</p>
    </section>
  );
}
