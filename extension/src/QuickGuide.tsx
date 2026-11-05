import { useState } from "react";

const steps = [
  {
    tab: "今日计划",
    icon: "☑",
    text: "这里安排每天的新题和到期复习。进度表示已学 / 今日安排，点击明细查看题目，点击「练习新题」或「回顾旧题」从第一道未完成题开始。",
  },
  {
    tab: "我的题单",
    icon: "📚",
    text: "选择内置题单，或通过公开链接、批量粘贴添加题单。进入题单后，点击「点击参与今日计划」加入安排。同一道题在不同题单中共享进度。",
  },
  {
    tab: "学习数据",
    icon: "📆",
    text: "查看学习题量、有效时长和学习日历。点选日期可以回顾当天的完成记录。题目的复习到期日按本地日期计算。",
  },
  {
    tab: "偏好设置",
    icon: "⚙",
    text: "设置每日新题和复习上限，定期导出 JSON 备份。开始练习会打开力扣题目，点击提交右侧的 RecallCode 计时，结束后选择 😭 😰 🙂 😁 并保存，下次复习会自动安排。",
  },
];

export function QuickGuide({
  onTab,
  onClose,
}: {
  onTab: (tab: string) => void;
  onClose: () => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const current = steps[step];
  const move = (next: number) => {
    setStep(next);
    onTab(steps[next].tab);
  };
  const close = () => void onClose().catch((error) => setError(String(error)));
  return (
    <section className="quick-guide" aria-label="快速上手">
      <div className="guide-heading">
        <span>
          快速上手 · {step + 1}/{steps.length}
        </span>
        <button onClick={close}>跳过引导</button>
      </div>
      <h2>
        {current.icon} {current.tab}
      </h2>
      <p>{current.text}</p>
      <div className="guide-actions">
        {step > 0 && <button onClick={() => move(step - 1)}>上一步</button>}
        {step < steps.length - 1 ? (
          <button className="study-primary" onClick={() => move(step + 1)}>
            下一步
          </button>
        ) : (
          <button className="study-primary" onClick={close}>
            开始使用
          </button>
        )}
      </div>
      {error && <p role="status">{error}</p>}
    </section>
  );
}
