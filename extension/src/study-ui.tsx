import type { Task } from "./domain/daily-planner";
import type { Review, Problem } from "./storage/db";

const ratingFaces: Record<string, string> = {
  Again: "😭",
  Hard: "😰",
  Good: "🙂",
  Easy: "😁",
};

export function RatingBadge({ rating }: { rating: string }) {
  return (
    <span className={`rating-badge rating-${rating.toLowerCase()}`}>
      <span aria-hidden="true">{ratingFaces[rating]}</span> {rating}
    </span>
  );
}

export function duration(seconds: number, precise = false) {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const parts = [
    hours && `${hours} 小时`,
    minutes && `${minutes} 分`,
    precise && `${total % 60} 秒`,
  ].filter(Boolean);
  return parts.join(" ") || (total ? "不足 1 分钟" : "0 分钟");
}

export function ImportPreview({ problems }: { problems: Problem[] }) {
  return (
    <ul className="import-preview" aria-label="待导入题目">
      {problems.map((problem) => (
        <li key={problem.key}>
          <span>{problem.frontendId ?? "编号待核验"}</span>
          {problem.title}
        </li>
      ))}
    </ul>
  );
}

export function TaskList({
  tasks,
  events,
  start,
  activeKey,
}: {
  tasks: Task[];
  events: Review[];
  start?: (problem: Problem) => void;
  activeKey?: string;
}) {
  const completed = new Map(events.map((event) => [event.problemKey, event]));
  return (
    <ul className="study-tasks">
      {tasks.map((task) => {
        const event = completed.get(task.problem.key);
        return (
          <li key={task.problem.key} className={event ? "task-done" : ""}>
            <span className="task-check" aria-hidden="true">
              {event ? "✓" : "·"}
            </span>
            <div className="task-copy">
              <strong>
                {task.problem.frontendId && `${task.problem.frontendId}. `}
                {task.problem.title}
              </strong>
              <div className="task-tags">
                <span
                  className={task.taskType === "new" ? "tag-new" : "tag-review"}
                >
                  {task.taskType === "new"
                    ? "新题"
                    : task.taskType === "assess"
                      ? "初评"
                      : "复习"}
                </span>
                {event ? (
                  <>
                    <span>已完成</span>
                    <RatingBadge rating={event.rating} />
                    <span>用时 {duration(event.activeSeconds, true)}</span>
                  </>
                ) : null}
              </div>
            </div>
            {!event && start && (
              <button onClick={() => start(task.problem)}>
                {activeKey === task.problem.key
                  ? "继续这题"
                  : activeKey
                    ? "切换到此题"
                    : "开始学习"}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
