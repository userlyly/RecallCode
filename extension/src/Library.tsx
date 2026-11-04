import { useEffect, useState } from "react";
import { PublicImport } from "./PublicImport";
import { liveQuery } from "dexie";
import { startTraining } from "./storage/training";
import { db, type Problem, type StudyList, type Progress } from "./storage/db";
import {
  presets,
  addList,
  renameList,
  markPrior,
  parsePaste,
} from "./domain/catalog";
export function Library({ onStudy }: { onStudy?: () => void }) {
  const [lists, setLists] = useState<StudyList[]>([]),
    [problems, setProblems] = useState<Problem[]>([]),
    [progress, setProgress] = useState<Progress[]>([]),
    [filter, setFilter] = useState(""),
    [listId, setListId] = useState(""),
    [difficulty, setDifficulty] = useState(""),
    [state, setState] = useState(""),
    [topic, setTopic] = useState(""),
    [text, setText] = useState(""),
    [name, setName] = useState("我的题单"),
    [merge, setMerge] = useState(false),
    [message, setMessage] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [preview, setPreview] = useState<ReturnType<typeof parsePaste>>();
  useEffect(() => {
    const sub = liveQuery(
      async () =>
        [
          await db.studyLists.toArray(),
          await db.problems.toArray(),
          await db.progress.toArray(),
        ] as const,
    ).subscribe({
      next: ([l, p, s]) => {
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
  const rows = problems.filter(
    (p) =>
      (!current || current.problemKeys.includes(p.key)) &&
      (!filter ||
        `${p.title} ${p.frontendId ?? ""} ${p.titleSlug ?? ""}`
          .toLowerCase()
          .includes(filter.toLowerCase())) &&
      (!difficulty || p.difficulty === difficulty) &&
      (!state || (states.get(p.key) ?? "unseen") === state) &&
      (!topic || p.topics.includes(topic)),
  );
  return (
    <>
      <section>
        <h2>选择题单</h2>
        <p>首次使用可先添加题单，再标记以前做过的题；它们会进入待评估状态。</p>
        <div className="actions">
          {presets.map((p) => (
            <button
              key={p.id}
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
            </button>
          ))}
        </div>
        <h2>我的题单</h2>
        {lists.length === 0 ? (
          <p>还没有题单，选择预置题单或在下方导入。</p>
        ) : (
          lists.map((l) => (
            <div className="list-row" key={l.id}>
              <button onClick={() => setListId(l.id)}>
                {l.name} · {l.problemKeys.length} 题 · 已学{" "}
                {
                  l.problemKeys.filter((k) =>
                    ["learning", "reviewing"].includes(states.get(k) ?? ""),
                  ).length
                }
              </button>
              <small>
                未学{" "}
                {
                  l.problemKeys.filter(
                    (k) => (states.get(k) ?? "unseen") === "unseen",
                  ).length
                }{" "}
                · 待评估{" "}
                {
                  l.problemKeys.filter(
                    (k) => states.get(k) === "prior_unassessed",
                  ).length
                }{" "}
                · 待复习{" "}
                {
                  l.problemKeys.filter((k) => {
                    const card = progress.find((p) => p.problemKey === k)
                      ?.fsrsCard as { dueAt?: string } | undefined;
                    return (
                      !!card?.dueAt && Date.parse(card.dueAt) <= Date.now()
                    );
                  }).length
                }
              </small>
              <button
                onClick={() =>
                  run(async () => {
                    const key = l.problemKeys.find((k) => {
                      const state = progress.find((p) => p.problemKey === k);
                      return (
                        !state?.fsrsCard ||
                        Date.parse(
                          (state.fsrsCard as { dueAt: string }).dueAt,
                        ) <= Date.now()
                      );
                    });
                    const p = problems.find((p) => p.key === key);
                    if (!p) throw Error("该题单暂无新题、初评或到期题目");
                    await startTraining(p.key);
                    onStudy?.();
                    await chrome.tabs.create({ url: p.url });
                  })
                }
              >
                从题单开始学习
              </button>
              <label>
                <input
                  type="checkbox"
                  checked={l.enabledForPlanning}
                  onChange={(e) =>
                    run(() =>
                      db.studyLists.update(l.id, {
                        enabledForPlanning: e.target.checked,
                      }),
                    )
                  }
                />
                参与今日计划
              </label>
              <button
                onClick={() => {
                  const name = prompt("题单新名称", l.name);
                  if (name) void run(() => renameList(l.id, name));
                }}
              >
                重命名
              </button>
              <button
                onClick={() => {
                  if (confirm("删除该题单？学习历史将保留。"))
                    void run(() => db.studyLists.delete(l.id));
                }}
              >
                删除
              </button>
            </div>
          ))
        )}
      </section>
      <PublicImport />
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
          onChange={(e) => setText(e.target.value)}
          placeholder="1, 2, 3 或力扣题目链接"
        />
        <button onClick={() => setPreview(parsePaste(text))}>解析预览</button>
        {preview && (
          <div>
            <p>
              识别 {preview.problems.length} / 重复 {preview.duplicates} /
              未识别 {preview.errors.length}
            </p>
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
              onClick={() => run(() => addList(name, preview.problems, merge))}
            >
              确认导入 {preview.problems.length} 道题
            </button>
          </div>
        )}
      </section>
      <section>
        <h2>题目 · {rows.length}</h2>
        <div className="actions">
          <input
            aria-label="搜索题目"
            placeholder="搜索题号、标题"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <select
            aria-label="筛选题单"
            value={listId}
            onChange={(e) => setListId(e.target.value)}
          >
            <option value="">全部题单</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <select
            aria-label="筛选难度"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
          >
            <option value="">全部难度</option>
            {["Easy", "Medium", "Hard", "Unknown"].map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <select
            aria-label="筛选状态"
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="">全部状态</option>
            <option value="unseen">未学</option>
            <option value="prior_unassessed">做过·待评估</option>
            <option value="learning">学习中</option>
            <option value="reviewing">复习中</option>
          </select>
          <select
            aria-label="筛选分类"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          >
            <option value="">全部分类</option>
            {[...new Set(problems.flatMap((p) => p.topics))].sort().map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <button
          disabled={!selected.length}
          onClick={() => run(() => markPrior(selected))}
        >
          标记选中 {selected.length} 题为以前做过·待评估
        </button>
        <button onClick={() => setSelected(rows.map((p) => p.key))}>
          选中当前结果
        </button>
        {rows.map((p) => (
          <div className="problem" key={p.key}>
            <label>
              <input
                type="checkbox"
                checked={selected.includes(p.key)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, p.key]
                      : selected.filter((k) => k !== p.key),
                  )
                }
              />
              <a href={p.url} target="_blank" rel="noreferrer">
                {p.frontendId ?? "未知编号"} · {p.title}
              </a>
            </label>
            <small>
              {p.difficulty} · {states.get(p.key) ?? "unseen"} ·{" "}
              {p.topics.join(" / ")}
            </small>
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
      {message && <p role="status">{message}</p>}
    </>
  );
}
