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
  const [tab, setTab] = useState("今日计划"),
    [prefs, setPrefs] = useState<Preferences>(defaults),
    [message, setMessage] = useState(""),
    [dailyStatus, setDailyStatus] = useState(""),
    [savingDaily, setSavingDaily] = useState(false),
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
        <strong className="recall-brand">
          <span className="recall-brand-icon">
            <img src="./recallcode-logo.png" alt="" />
          </span>
          RecallCode
        </strong>
      </header>
      <nav className="panel-nav" aria-label="学习工作台">
        {["今日计划", "我的题单", "学习数据", "偏好设置"].map((tabName) => (
          <button
            key={tabName}
            aria-pressed={tab === tabName}
            className={tab === tabName ? "selected" : ""}
            onClick={() => setTab(tabName)}
          >
            {tabName}
          </button>
        ))}
      </nav>
      {tab !== "我的题单" && <h1>{tab}</h1>}
      {tab === "今日计划" ? (
        <Today onLibrary={() => setTab("我的题单")} />
      ) : tab === "我的题单" ? (
        <Library />
      ) : tab === "学习数据" ? (
        <Analysis />
      ) : (
        <>
          <section className="daily-settings">
            <h2>每日偏好</h2>
            <div className="daily-limits">
              <label>
                每日复习上限
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={prefs.reviewPerDay ?? 10}
                  onChange={(e) =>
                    setPrefs({ ...prefs, reviewPerDay: Number(e.target.value) })
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
            </div>
            <button
              className="study-primary"
              disabled={savingDaily}
              onClick={async () => {
                setSavingDaily(true);
                setDailyStatus("");
                try {
                  await savePreferences({
                    ...(await preferences()),
                    reviewPerDay: prefs.reviewPerDay ?? 10,
                    newPerDay: prefs.newPerDay,
                  });
                  setDailyStatus("每日偏好已保存");
                } catch (error) {
                  setDailyStatus(
                    error instanceof Error ? error.message : String(error),
                  );
                } finally {
                  setSavingDaily(false);
                }
              }}
            >
              {savingDaily ? "正在保存…" : "保存每日偏好"}
            </button>
            {dailyStatus && (
              <p className="study-feedback" role="status">
                {dailyStatus}
              </p>
            )}
          </section>
          <section className="backup-settings">
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
            {message && (
              <p className="study-feedback" role="status">
                {message}
              </p>
            )}
          </section>
        </>
      )}
      {tab === "偏好设置" && (
        <>
          <Integration />
        </>
      )}
      {tab !== "偏好设置" && message && <p role="status">{message}</p>}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
