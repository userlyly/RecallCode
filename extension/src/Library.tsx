import { localDate, reviewDate } from "./domain/calendar";
import type { StoredCard } from "./domain/fsrs";
import { preferences } from "./storage/db";
import { ImportPreview } from "./study-ui";
import { useEffect, useState } from "react";
import { PublicImport } from "./PublicImport";
import { liveQuery } from "dexie";
import { db, type Problem, type StudyList, type Progress } from "./storage/db";
import { presets, addList, renameList, parsePaste } from "./domain/catalog";
export function Library() {
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const refresh = () => setClock(Date.now());
    const timer = setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const [lists, setLists] = useState<StudyList[]>([]),
    [problems, setProblems] = useState<Problem[]>([]),
    [progress, setProgress] = useState<Progress[]>([]),
    [filter, setFilter] = useState(""),
    [listId, setListId] = useState(""),
    [state, setState] = useState(""),
    [text, setText] = useState(""),
    [name, setName] = useState("我的题单"),
    [merge, setMerge] = useState(false),
    [message, setMessage] = useState(""),
    [saved, setSaved] = useState(""),
    [importMode, setImportMode] = useState<"" | "preset" | "paste" | "url">(""),
    [preview, setPreview] = useState<ReturnType<typeof parsePaste>>();
  useEffect(() => {
    const sub = liveQuery(
      async () =>
        [
          await db.studyLists.toArray(),
          await db.problems.toArray(),
          await db.progress.toArray(),
          (await preferences()).timezone,
        ] as const,
    ).subscribe({
      next: ([l, p, s, timezone]) => {
        setTimezone(timezone);
        setLists(l);
        setProblems(p);
        setProgress(s);
      },
      error: (e) => setMessage(String(e)),
    });
    return () => sub.unsubscribe();
  }, []);
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      setMessage("已保存");
    } catch (e) {
      setMessage(String(e));
    }
  };
  const states = new Map(progress.map((p) => [p.problemKey, p.state]));
  const current = lists.find((l) => l.id === listId);
  const byKey = new Map(problems.map((problem) => [problem.key, problem]));
  const listProblems = (current?.problemKeys ?? []).flatMap((key) => {
    const problem = byKey.get(key);
    return problem ? [problem] : [];
  });
  const dueKeys = new Set(
    progress
      .filter((item) => {
        const card = item.fsrsCard as StoredCard | undefined;
        return (
          card &&
          reviewDate(card, timezone) <= localDate(new Date(clock), timezone)
        );
      })
      .map((item) => item.problemKey),
  );
  const learnedCount = listProblems.filter((problem) =>
    ["learning", "reviewing"].includes(states.get(problem.key) ?? ""),
  ).length;
  const dueCount = listProblems.filter((problem) =>
    dueKeys.has(problem.key),
  ).length;
  const stateLabels = {
    unseen: "未学",
    prior_unassessed: "已做过",
    learning: "学习中",
    reviewing: "复习中",
  };
  const difficultyLabels: Record<string, string> = {
    Easy: "简单",
    Medium: "中等",
    Hard: "困难",
    Unknown: "难度未知",
  };
  const rows = listProblems.filter(
    (problem) =>
      `${problem.title} ${problem.frontendId ?? ""} ${problem.titleSlug ?? ""}`
        .toLowerCase()
        .includes(filter.trim().toLowerCase()) &&
      (!state ||
        (state === "due"
          ? dueKeys.has(problem.key)
          : (states.get(problem.key) ?? "unseen") === state)),
  );
  const resetFilters = () => {
    setFilter("");
    setState("");
  };
  return (
    <>
      <div className="library-title">
        <h1>我的题单</h1>
        {current && (
          <button
            onClick={() => {
              setListId("");
              resetFilters();
            }}
          >
            ← 返回题单
          </button>
        )}
      </div>
      {!current && (
        <>
          <section className="study-card">
            <div className="study-heading">
              <h2>已添加题单</h2>
              <button
                className="study-primary"
                aria-expanded={!!importMode}
                onClick={() => setImportMode(importMode ? "" : "preset")}
              >
                {importMode ? "关闭添加" : "添加题单"}
              </button>
            </div>
            {lists.length === 0 ? (
              <p>还没有题单。添加一张题单，开始安排每日学习。</p>
            ) : (
              lists.map((list) => {
                const learned = list.problemKeys.filter((key) =>
                  ["learning", "reviewing"].includes(states.get(key) ?? ""),
                ).length;
                return (
                  <article className="library-card" key={list.id}>
                    <button
                      className="library-open"
                      onClick={() => {
                        setListId(list.id);
                      }}
                    >
                      <ListCover
                        id={list.id}
                        official={list.sourceType === "preset"}
                      />
                      <span className="library-copy">
                        <strong>{list.name}</strong>
                        <span>
                          {list.problemKeys.length} 题 · 已学 {learned}
                        </span>
                        <progress
                          aria-label="题单进度"
                          max={Math.max(1, list.problemKeys.length)}
                          value={learned}
                        />
                      </span>
                      <span aria-hidden="true">›</span>
                    </button>
                  </article>
                );
              })
            )}
          </section>
          {importMode && (
            <section className="import-methods">
              <h2>添加题单</h2>
              <div className="actions">
                <button
                  aria-pressed={importMode === "preset"}
                  onClick={() => setImportMode("preset")}
                >
                  预置题单
                </button>
                <button
                  aria-pressed={importMode === "paste"}
                  onClick={() => setImportMode("paste")}
                >
                  批量粘贴
                </button>
                <button
                  aria-pressed={importMode === "url"}
                  onClick={() => setImportMode("url")}
                >
                  公开链接
                </button>
              </div>
              {importMode === "preset" && (
                <div className="actions">
                  {presets.map((p) => {
                    const added = lists.some(
                      (list) =>
                        list.id === p.id || list.sourceUrl === p.sourceUrl,
                    );
                    return (
                      <button
                        key={p.id}
                        disabled={added}
                        onClick={() =>
                          run(() =>
                            addList(
                              p.name,
                              p.questions,
                              true,
                              p.id,
                              "preset",
                              p.sourceUrl,
                            ),
                          )
                        }
                      >
                        {p.name} · {p.questions.length} 题
                        {added ? " · 已添加" : ""}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          )}
          {importMode === "url" && (
            <PublicImport
              onOpen={setListId}
              onPaste={() => setImportMode("paste")}
            />
          )}
          {importMode === "paste" && (
            <section>
              <h2>批量粘贴</h2>
              <p>
                支持编号、题目链接和 Markdown
                链接。未核验编号会提示补充链接；未知链接保留“待补全标题”。
              </p>
              <label>
                题单名称
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <textarea
                aria-label="批量粘贴题目"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setPreview(undefined);
                }}
                placeholder="1, 2, 3 或力扣题目链接"
              />
              <button onClick={() => setPreview(parsePaste(text))}>
                解析预览
              </button>
              {preview && (
                <div>
                  <p>
                    识别 {preview.problems.length} / 重复 {preview.duplicates} /
                    未识别 {preview.errors.length}
                  </p>
                  <ImportPreview problems={preview.problems} />
                  {preview.errors.length > 0 && (
                    <details>
                      <summary>查看未识别内容</summary>
                      {preview.errors.map((e, i) => (
                        <p key={i}>{e}</p>
                      ))}
                    </details>
                  )}
                  <label>
                    <input
                      type="checkbox"
                      checked={merge}
                      onChange={(e) => setMerge(e.target.checked)}
                    />
                    与同名题单合并（否则请另存新名）
                  </label>
                  <button
                    disabled={!preview.problems.length}
                    onClick={async () => {
                      try {
                        const result = await addList(
                          name,
                          preview.problems,
                          merge,
                        );
                        setSaved(result.id);
                        setMessage(
                          `导入成功 · 新增 ${result.added} 道，跳过 ${result.duplicates + preview.duplicates} 道重复题`,
                        );
                        setPreview(undefined);
                      } catch (error) {
                        setMessage(String(error));
                      }
                    }}
                  >
                    确认导入 {preview.problems.length} 道题
                  </button>
                </div>
              )}
            </section>
          )}
        </>
      )}
      {current && (
        <section>
          <div className="detail-hero">
            <ListCover
              id={current.id}
              official={current.sourceType === "preset"}
            />
            <div className="detail-card-copy">
              <div className="detail-card-heading">
                <h2>{current.name}</h2>
                <div className="detail-card-icons">
                  <button
                    type="button"
                    aria-label="编辑题单名称"
                    title="编辑题单名称"
                    onClick={() => {
                      const name = prompt("题单新名称", current.name);
                      if (name) void run(() => renameList(current.id, name));
                    }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m15 5 4 4M4 20l4-.8L20 7l-4-4L4.8 15.2z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="delete-list"
                    aria-label="删除题单"
                    title="删除题单"
                    onClick={() => {
                      if (confirm("删除该题单？学习历史将保留。"))
                        void run(async () => {
                          await db.studyLists.delete(current.id);
                          setListId("");
                          resetFilters();
                        });
                    }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7" />
                    </svg>
                  </button>
                </div>
              </div>
              <button
                type="button"
                className="detail-plan-toggle"
                aria-pressed={current.enabledForPlanning}
                onClick={() =>
                  void run(() =>
                    db.studyLists.update(current.id, {
                      enabledForPlanning: !current.enabledForPlanning,
                    }),
                  )
                }
              >
                {current.enabledForPlanning
                  ? "✓ 已参与今日计划"
                  : "点击参与今日计划"}
              </button>
            </div>
            <div className="detail-progress">
              <label htmlFor="detail-progress">
                已学 {learnedCount} / {listProblems.length}
              </label>
              <progress
                id="detail-progress"
                value={learnedCount}
                max={Math.max(1, listProblems.length)}
              />
            </div>
          </div>
          <input
            className="detail-search"
            aria-label="搜索题目"
            placeholder="搜索题号、标题"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
            }}
          />
          <div className="detail-tabs" aria-label="学习状态">
            {[
              ["", "全部"],
              ["unseen", "未学"],
              ["due", `待复习 ${dueCount}`],
              ["learning", "学习中"],
              ["reviewing", "复习中"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={state === value}
                onClick={() => {
                  setState(value);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {!rows.length && (
            <p className="detail-empty">
              没有符合条件的题目。{" "}
              <button onClick={resetFilters}>清除筛选</button>
            </p>
          )}
          {rows.map((p) => (
            <div className="detail-problem" key={p.key}>
              <a
                className="detail-problem-link"
                href={p.url}
                target="_blank"
                rel="noreferrer"
              >
                <strong>
                  {p.frontendId ? p.frontendId + ". " : ""}
                  {p.title}
                </strong>
                <span className="detail-meta">
                  <span className={`difficulty-${p.difficulty.toLowerCase()}`}>
                    {difficultyLabels[p.difficulty] ?? p.difficulty}
                  </span>
                  <span>
                    {dueKeys.has(p.key)
                      ? "待复习"
                      : stateLabels[states.get(p.key) ?? "unseen"]}
                  </span>
                </span>
                <span className="detail-open" aria-hidden="true">
                  ↗
                </span>
              </a>
              {p.title === "待补全标题" && (
                <button
                  onClick={() => {
                    const title = prompt("补充显示标题（个人元数据）");
                    if (title?.trim())
                      void run(() =>
                        db.problems.update(p.key, { title: title.trim() }),
                      );
                  }}
                >
                  补充标题
                </button>
              )}
            </div>
          ))}
        </section>
      )}
      {saved && !current && (
        <button onClick={() => setListId(saved)}>查看题单</button>
      )}
      {message && <p role="status">{message}</p>}
    </>
  );
}

function ListCover({ id, official }: { id: string; official: boolean }) {
  const variant = official ? id : "custom";
  const label =
    variant === "hot100"
      ? "100"
      : variant === "interview150"
        ? "150"
        : variant === "sql50"
          ? "SQL"
          : "{ }";
  return (
    <span className={`list-cover cover-${variant}`} aria-hidden="true">
      <svg viewBox="0 0 54 66" fill="none">
        <path
          d="M7 44 27 27 47 44M7 51l20-17 20 17M7 58l20-17 20 17"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity=".45"
        />
      </svg>
      <b>{label}</b>
    </span>
  );
}
