import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  defaults,
  preferences,
  savePreferences,
  type Preferences,
} from "./storage/db";
import {
  exportBackup,
  restoreBackup,
  validateBackup,
  type Backup,
} from "./storage/backup";
import "./styles.css";
import { Library } from "./Library";
import { Today } from "./Today";
import { Integration } from "./Integration";
import { AdvancedSettings } from "./AdvancedSettings";
import { Analysis } from "./Analysis";
import { Welcome } from "./Welcome";
import { db } from "./storage/db";
import { migrateV1, migrationWarning } from "./storage/migrate-v1";
function App() {
  const [welcome, setWelcome] = useState<boolean>();
  useEffect(() => {
    db.meta
      .get("onboarding")
      .then((x) => setWelcome(!x?.value))
      .catch((e) => {
        setMessage(String(e));
        setWelcome(false);
      });
  }, []);
  const [tab, setTab] = useState("今日学习"),
    [prefs, setPrefs] = useState<Preferences>(defaults),
    [message, setMessage] = useState(""),
    [preview, setPreview] = useState<Backup>();
  useEffect(() => {
    preferences()
      .then(setPrefs)
      .catch((e) => setMessage(String(e)));
  }, []);
  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };
  if (welcome === undefined)
    return (
      <main>
        <p role="status">正在读取本机学习数据…</p>
      </main>
    );
  if (welcome)
    return (
      <main>
        <h1>欢迎使用 RecallCode</h1>
        <Welcome
          done={() => {
            setWelcome(false);
            void preferences().then(setPrefs);
          }}
        />
      </main>
    );
  return (
    <main>
      <header>
        <strong>◈ RecallCode</strong>
        <button onClick={() => setTab("偏好设置")}>偏好设置</button>
      </header>
      <nav>
        {["今日学习", "算法题库", "学习分析"].map((t) => (
          <button
            className={tab === t ? "selected" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>
      <p className="eyebrow">本机保存 · 无需账号</p>
      <h1>{tab}</h1>
      {tab === "今日学习" ? (
        <Today />
      ) : tab === "算法题库" ? (
        <Library onStudy={() => setTab("今日学习")} />
      ) : tab === "学习分析" ? (
        <Analysis />
      ) : (
        <section>
          <h2>每日偏好</h2>
          <label>
            时间预算（分钟）
            <input
              type="number"
              min="1"
              max="240"
              value={prefs.minutesPerDay}
              onChange={(e) =>
                setPrefs({ ...prefs, minutesPerDay: Number(e.target.value) })
              }
            />
          </label>
          <label>
            每日新题上限
            <input
              type="number"
              min="0"
              max="20"
              value={prefs.newPerDay}
              onChange={(e) =>
                setPrefs({ ...prefs, newPerDay: Number(e.target.value) })
              }
            />
          </label>
          <button
            onClick={() =>
              run(async () => {
                await savePreferences({
                  ...(await preferences()),
                  minutesPerDay: prefs.minutesPerDay,
                  newPerDay: prefs.newPerDay,
                });
                setMessage("设置已保存");
              })
            }
          >
            保存设置
          </button>
          <h2>备份与恢复</h2>
          <p>
            恢复默认合并；相同主键保留本机记录，设置采用备份值。卸载或清理扩展数据可能丢失记录，请定期备份。
          </p>
          <button
            onClick={() =>
              run(async () => {
                const b = await exportBackup();
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(b, null, 2)], {
                    type: "application/json",
                  }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = "recallcode-backup.json";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              })
            }
          >
            导出 JSON 备份
          </button>
          <label>
            选择备份文件
            <input
              type="file"
              accept=".json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void run(async () => {
                    setPreview(undefined);
                    const raw = JSON.parse(await file.text());
                    setPreview(
                      raw?.version === 1
                        ? await migrateV1(raw)
                        : validateBackup(raw),
                    );
                    if (raw?.version === 1) {
                      setMessage(migrationWarning);
                      return;
                    }
                    setMessage("校验通过，请确认合并");
                  });
              }}
            />
          </label>
          {preview && (
            <div>
              <p>
                {preview.problems.length} 道题 · {preview.studyLists.length}{" "}
                张题单 · {preview.reviewEvents.length} 条记录
              </p>
              <button
                onClick={() =>
                  run(async () => {
                    await restoreBackup(preview);
                    setPrefs(await preferences());
                    setPreview(undefined);
                    setMessage("合并完成");
                  })
                }
              >
                确认合并到本机
              </button>
            </div>
          )}
        </section>
      )}
      {tab === "偏好设置" && (
        <>
          <Integration />
          <AdvancedSettings />
        </>
      )}
      {message && <p role="status">{message}</p>}
      <footer>
        <p>开发中 · 尚未达到 2.0 完整验收标准</p>
        {location.pathname.includes("sidepanel") && (
          <button
            onClick={() =>
              chrome.tabs.create({
                url: chrome.runtime.getURL("dashboard.html"),
              })
            }
          >
            打开完整管理页 ↗
          </button>
        )}
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
