(() => {
  const dismissed = new Set();
  function mount() {
    if (document.getElementById("recallcode-inline")) return;
    const match = location.pathname.match(/^\/problems\/([a-z0-9-]+)\//);
    if (!match || dismissed.has(match[1])) return;
    const host = document.createElement("div");
    host.id = "recallcode-inline";
    host.style.cssText =
      "position:fixed;bottom:18px;right:18px;z-index:2147483000;max-width:300px";
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent =
      "section{font:13px system-ui;background:#f4fff7;color:#174732;border:1px solid #9bc8ac;border-radius:12px;padding:12px;box-shadow:0 4px 18px #0002}button{margin:4px;padding:6px;border:1px solid #b6d7c2;border-radius:7px;background:white;color:#174732;cursor:pointer}p{line-height:1.5}";
    root.append(style);
    const box = document.createElement("section");
    root.append(box);
    const title = document.createElement("strong");
    title.textContent = "RecallCode · 当前题目";
    box.append(title);
    const close = document.createElement("button");
    close.textContent = "关闭";
    close.onclick = () => {
      dismissed.add(match[1]);
      host.remove();
    };
    box.append(close);
    const status = document.createElement("p");
    status.textContent = "准备识别题目";
    box.append(status);
    let sessionId;
    const send = async (action, extra = {}) => {
      const r = await chrome.runtime.sendMessage({
        type: "recallcode",
        action,
        slug: match[1],
        ...extra,
      });
      if (!r?.ok) throw Error(r?.error || "插件通信失败");
      return r.value;
    };
    const button = (label, fn) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.onclick = async () => {
        b.disabled = true;
        try {
          await fn();
        } catch (e) {
          status.textContent = String(e);
        } finally {
          b.disabled = false;
        }
      };
      box.append(b);
    };
    button("开始", async () => {
      const r = await send("start");
      sessionId = r.id;
      status.textContent = "已开始训练；请主动评价，不自动判断 Accepted。";
    });
    button("暂停", async () => {
      if (sessionId) await send("pause", { sessionId });
      status.textContent = "已暂停";
    });
    button("继续", async () => {
      if (!sessionId) sessionId = (await send("start")).id;
      else await send("resume", { sessionId });
      status.textContent = "训练中";
    });
    for (const rating of ["Again", "Hard", "Good", "Easy"])
      button(rating, async () => {
        if (!sessionId) throw Error("请先开始训练");
        const result = await send("rate", { sessionId, rating });
        status.textContent =
          "已保存 " +
          rating +
          "，下次复习：" +
          new Date(result.nextDue).toLocaleString();
        sessionId = undefined;
      });
    send("identify")
      .then((r) => {
        status.textContent = r.title;
        sessionId = r.sessionId;
      })
      .catch((e) => {
        status.textContent = String(e);
      });
    document.body.append(host);
    let lastActivity = 0;
    const activity = (event) => {
      if (!host.isConnected) {
        document.removeEventListener("keydown", activity);
        document.removeEventListener("pointerdown", activity);
        return;
      }
      if (event.isTrusted && sessionId && Date.now() - lastActivity > 5000) {
        lastActivity = Date.now();
        send("activity", { sessionId }).catch(() => {});
      }
    };
    document.addEventListener("keydown", activity);
    document.addEventListener("pointerdown", activity);
    const timer = setInterval(() => {
      if (location.pathname.split("/")[2] !== match[1]) host.remove();
      if (!host.isConnected) {
        clearInterval(timer);
        return;
      }
      if (sessionId && document.visibilityState === "visible")
        send("heartbeat", { sessionId })
          .then((s) => {
            if (s)
              status.textContent =
                (s.status === "running" ? "训练中" : "已暂停") +
                " · " +
                Math.round(s.activeSeconds) +
                " 秒";
          })
          .catch(() => {});
    }, 5000);
  }
  mount();
  setInterval(mount, 2000);
})();
