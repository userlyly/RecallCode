import { useState } from "react";
import { presets, addList, markPrior } from "./domain/catalog";
import { db, defaults, savePreferences } from "./storage/db";
export function Welcome({ done }: { done: () => void }) {
  const [step, setStep] = useState(1),
    [selected, setSelected] = useState<string[]>(["hot100"]),
    [prior, setPrior] = useState(false),
    [minutes, setMinutes] = useState(30),
    [limit, setLimit] = useState(2),
    [error, setError] = useState("");
  const finish = async () => {
    try {
      const chosen = presets.filter((p) => selected.includes(p.id));
      for (const p of chosen)
        await addList(p.name, p.questions, true, p.id, "preset", p.sourceUrl);
      if (prior)
        await markPrior(chosen.flatMap((p) => p.questions.map((q) => q.key)));
      await savePreferences({
        ...defaults,
        minutesPerDay: minutes,
        newPerDay: limit,
      });
      await db.meta.put({ key: "onboarding", value: true });
      done();
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <section>
      <p>首次设置 · {step}/3</p>
      <h2>
        {step === 1
          ? "选择学习题单"
          : step === 2
            ? "以前做过这些题吗？"
            : "每天投入一点时间"}
      </h2>
      {step === 1 &&
        presets.map((p) => (
          <label key={p.id}>
            <input
              type="checkbox"
              checked={selected.includes(p.id)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, p.id]
                    : selected.filter((id) => id !== p.id),
                )
              }
            />
            {p.name} · {p.questions.length} 题
          </label>
        ))}
      {step === 2 && (
        <>
          <label>
            <input
              type="radio"
              checked={!prior}
              onChange={() => setPrior(false)}
            />
            全部未做 / 只做过一部分
          </label>
          <label>
            <input
              type="radio"
              checked={prior}
              onChange={() => setPrior(true)}
            />
            几乎都做过，标记为待评估
          </label>
          <p>
            只做过一部分：完成设置后到题库勾选历史题目。历史做过不会被直接认定为掌握。
          </p>
        </>
      )}
      {step === 3 && (
        <>
          <label>
            每日分钟
            <select
              value={minutes}
              onChange={(e) => setMinutes(+e.target.value)}
            >
              {[15, 30, 45, 60].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            每日新题上限
            <input
              type="number"
              min="0"
              max="20"
              value={limit}
              onChange={(e) => setLimit(+e.target.value)}
            />
          </label>
        </>
      )}
      {step > 1 && <button onClick={() => setStep(step - 1)}>上一步</button>}
      {step < 3 ? (
        <button onClick={() => setStep(step + 1)}>下一步</button>
      ) : (
        <button onClick={finish}>开始今日计划</button>
      )}
      <p role="status">{error}</p>
    </section>
  );
}
