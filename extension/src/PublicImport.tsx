import { useRef, useState } from "react";
import { addList, canonicalUrl, catalog, presets } from "./domain/catalog";
import { type Problem } from "./storage/db";
import { ImportPreview } from "./study-ui";
export function PublicImport({
  onOpen,
  onPaste,
}: {
  onOpen: (id: string) => void;
  onPaste: () => void;
}) {
  const [saved, setSaved] = useState("");
  const [source, setSource] = useState("");
  const [url, setUrl] = useState(""),
    [name, setName] = useState("公开题单"),
    [status, setStatus] = useState(""),
    [preview, setPreview] = useState<Problem[]>([]),
    [complete, setComplete] = useState(false),
    [partial, setPartial] = useState(false),
    [merge, setMerge] = useState(false);
  const sourceTab = useRef<{ url: string; id: number } | undefined>(undefined);
  const [tabId, setTabId] = useState<number>();
  const [busy, setBusy] = useState(false);
  const parse = async () => {
    if (busy) return;
    setBusy(true);
    setSaved("");
    setPreview([]);
    setComplete(false);
    setPartial(false);
    try {
      const u = new URL(url);
      if (
        !["https://leetcode.cn", "https://leetcode.com"].includes(u.origin) ||
        !/^\/(studyplan|problem-list|list)\/[a-zA-Z0-9-]+\/?$/.test(
          u.pathname,
        ) ||
        u.password ||
        u.username
      )
        throw Error("请输入力扣中国站或国际站的公开题单链接");
      if (
        !(await chrome.permissions.request({
          origins: [u.origin + "/*"],
        }))
      )
        throw Error("未授权读取力扣页面");
      u.search = "";
      u.hash = "";
      setSource(u.href);
      const existing =
        sourceTab.current?.url === u.href
          ? await chrome.tabs.get(sourceTab.current.id).catch(() => undefined)
          : undefined;
      const tab =
        existing ?? (await chrome.tabs.create({ url: u.href, active: false }));
      if (!tab.id) throw Error("无法打开题单页面");
      sourceTab.current = { url: u.href, id: tab.id };
      setTabId(tab.id);
      setStatus("已打开公开页面，等待加载；若页面有验证，请自行处理后重试。");
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          reject(Error("页面加载超时，请使用批量粘贴"));
        }, 25000);
        const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
          if (id === tab.id && info.status === "complete") {
            clearTimeout(timeout);
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        chrome.tabs
          .get(tab.id!)
          .then((t) => {
            if (t.status === "complete") {
              clearTimeout(timeout);
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          })
          .catch(reject);
      });
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({
          embedded: document.querySelector("#__NEXT_DATA__")?.textContent ?? "",
          links: [
            ...document.querySelectorAll<HTMLAnchorElement>(
              'main a[href*="/problems/"], [role="main"] a[href*="/problems/"]',
            ),
          ].map((a) => ({ url: a.href, title: a.textContent ?? "" })),
          title: document.title,
          origin: location.origin,
        }),
      });
      const data = results[0]?.result;
      if (!data) throw Error("页面无可读数据，可能受限或页面格式已变化");
      if (data.origin !== u.origin) throw Error("题单页面跳转到其他站点");
      if (
        /请稍候|just a moment|access denied|verify you are human/i.test(
          data.title,
        )
      )
        throw Error("力扣要求验证。请打开来源页完成验证，再返回重新读取");
      const raw = data.embedded ? JSON.parse(data.embedded) : undefined;
      const queries = raw?.props?.pageProps?.dehydratedState?.queries ?? [];
      const detail = queries.find((q: any) => q.state?.data?.studyPlanV2Detail)
        ?.state.data.studyPlanV2Detail;
      let rows: Problem[] = [];
      let verified = false;
      if (detail?.planSubGroups) {
        rows = detail.planSubGroups.flatMap((g: any) =>
          g.questions.map((q: any) => {
            if (!q.questionFrontendId || !q.titleSlug || !q.id)
              throw Error("题目字段缺失");
            const normalized = canonicalUrl(
              `${u.origin}/problems/${q.titleSlug}/`,
              true,
            );
            return {
              key:
                catalog.find(
                  (p) =>
                    p.titleSlug === normalized.slug &&
                    p.frontendId === String(q.questionFrontendId),
                )?.key ??
                `leetcode:${u.hostname === "leetcode.com" ? "com" : "cn"}:${q.questionFrontendId}`,
              frontendId: String(q.questionFrontendId),
              title: q.translatedTitle || q.title,
              titleSlug: normalized.slug,
              url: normalized.url,
              difficulty:
                (
                  { EASY: "Easy", MEDIUM: "Medium", HARD: "Hard" } as Record<
                    string,
                    string
                  >
                )[q.difficulty as string] ?? "Unknown",
              topics: (q.topicTags ?? []).map(
                (t: any) => t.nameTranslated || t.name,
              ),
              source: "page",
            };
          }),
        );
        const preset = presets.find(
          (p) =>
            new URL(p.sourceUrl).pathname === u.pathname.replace(/\/?$/, "/"),
        );
        verified =
          !!preset &&
          rows.length === preset.questions.length &&
          rows.every((r) =>
            preset.questions.some(
              (p) => p.key === r.key && p.titleSlug === r.titleSlug,
            ),
          );
        setName(detail.name ?? data.title);
      } else {
        for (const l of data.links) {
          try {
            const p = canonicalUrl(l.url, true);
            if (new URL(p.url).origin !== u.origin || !l.title.trim()) continue;
            const known = catalog.find(
              (question) => question.titleSlug === p.slug,
            );
            const label = l.title.trim().match(/^(\d+)\.\s*(.+)$/);
            rows.push({
              key:
                known?.key ??
                (u.hostname === "leetcode.com"
                  ? "leetcode:com:slug:"
                  : "leetcode:slug:") + p.slug,
              frontendId: known?.frontendId ?? label?.[1],
              title: label?.[2] ?? known?.title ?? l.title.trim(),
              titleSlug: p.slug,
              url: p.url,
              difficulty: "Unknown",
              topics: [],
              source: "page",
            });
          } catch {}
        }
      }
      const unique = [...new Map(rows.map((p) => [p.key, p])).values()];
      if (!unique.length)
        throw Error(
          "未读到真实题目：可能为私有题单、需要登录、分页未展示或格式变化。请复制题目列表到批量粘贴入口。",
        );
      if (unique.length !== rows.length) verified = false;
      setPreview(unique);
      setComplete(verified);
      setStatus(
        verified
          ? `已核对完整官方题单：${unique.length} 道`
          : `已识别 ${unique.length} 道 / 完整性未确认。请滚动补齐或批量粘贴，部分导入需主动确认。`,
      );
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <h2>公开题单链接</h2>
      <p>
        读取你主动打开的公开页面；不绕过登录、验证或付费限制。通用题单无法确认完整时仅允许明确的部分导入。
      </p>
      <label>
        题单 URL
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <div className="actions">
        <button className="study-primary" onClick={parse} disabled={busy}>
          {busy ? "正在读取…" : "授权并读取公开题单"}
        </button>
        {tabId && (
          <button
            onClick={() =>
              void chrome.tabs
                .update(tabId, { active: true })
                .catch(() => setStatus("来源标签已关闭，请重新读取"))
            }
          >
            打开来源页
          </button>
        )}
      </div>
      <p role="status">{status}</p>
      {status && !busy && !complete && (
        <button onClick={onPaste}>改用批量粘贴</button>
      )}
      {saved && <button onClick={() => onOpen(saved)}>查看题单</button>}
      {preview.length > 0 && (
        <>
          <label>
            导入题单名称
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <ImportPreview problems={preview} />
          {!complete && (
            <label>
              <input
                type="checkbox"
                checked={partial}
                onChange={(e) => setPartial(e.target.checked)}
              />
              我了解完整性未确认，仅导入当前 {preview.length} 道
            </label>
          )}
          <label>
            <input
              type="checkbox"
              checked={merge}
              onChange={(e) => setMerge(e.target.checked)}
            />
            合并同名题单
          </label>
          <button
            disabled={!complete && !partial}
            onClick={async () => {
              try {
                const result = await addList(
                  name,
                  preview,
                  merge,
                  crypto.randomUUID(),
                  "url",
                  source,
                );
                setStatus(
                  `导入成功 · ${complete ? "完整" : "部分"}导入新增 ${result.added} 道，跳过 ${result.duplicates} 道重复题`,
                );
                setSaved(result.id);
                setPreview([]);
              } catch (e) {
                setStatus(String(e));
              }
            }}
          >
            确认{complete ? "完整" : "部分"}导入
          </button>
        </>
      )}
    </section>
  );
}
