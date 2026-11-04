(() => {
  if (document.documentElement.dataset.recallcodeToolbar) return;
  document.documentElement.dataset.recallcodeToolbar = "true";
  const grades = [
    ["Again", "😭", "没做出来"],
    ["Hard", "😰", "完成很吃力"],
    ["Good", "🙂", "独立完成"],
    ["Easy", "😁", "轻松完成"],
  ];
  let mounted,
    disabled = false;
  const currentSlug = () =>
    location.pathname.match(/^\/problems\/([a-z0-9-]+)(?:\/|$)/)?.[1];
  function submitButton() {
    return (
      document.querySelector(
        'button[data-e2e-locator="console-submit-button"]',
      ) ??
      [
        ...document.querySelectorAll(
          'button[aria-label="提交"],button[aria-label="Submit"],button[data-cy="submit-code-btn"]',
        ),
      ].find((button) => button.getClientRects().length)
    );
  }
  function toolbarAnchor(submit) {
    const group = submit.closest(".overflow-hidden.rounded, [role='group']");
    if (!group) return submit;
    // The CN toolbar wraps the native run/submit group in a single-child slot.
    const slot = group.parentElement;
    return slot?.children.length === 1 &&
      slot.parentElement?.classList.contains("flex")
      ? slot
      : group;
  }
  function mount(slug, submit) {
    const host = document.createElement("span");
    host.id = "recallcode-inline";
    host.style.cssText =
      "display:inline-flex;flex:none;align-items:center;margin-left:9px";
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host { font: 14px/1.45 system-ui,sans-serif; color: #172920; }
      * { box-sizing:border-box; }
      button { cursor:pointer; font:inherit; color:inherit; border:1px solid #c9dcd0; background:#fff; border-radius:9px; padding:7px 10px; }
      button:disabled { cursor:default; opacity:.55; }
      button:focus-visible,textarea:focus-visible { outline:2px solid #278763; outline-offset:2px; }
      .trigger { display:flex;align-items:center;gap:5px;white-space:nowrap;background:#f4f7f5;color:#234237;font-weight:650;border-color:#dbe5df;padding:4px 8px; } .trigger:hover {background:#e7f2ea;} .trigger .logo {display:inline-grid;place-items:center;width:25px;height:25px;overflow:hidden;border-radius:5px;} .trigger img {width:100%;height:100%;object-fit:contain;transform:scale(1.6);} .trigger[data-running=true] {box-shadow:inset 0 -2px #38865f;}
      .panel { position:fixed; margin:0; padding:12px; width:min(440px,calc(100vw - 16px)); max-height:calc(100vh - 80px); overflow:auto; border:1px solid #c9dcd0; border-radius:16px; background:#fff; color:#172920; box-shadow:0 12px 36px #142a2233; }
      header,.clock,.note-heading,.actions { display:flex; align-items:center; justify-content:space-between; gap:8px; }
      header strong { font-size:17px; } .clock { margin:8px 0; background:#edf6f0; padding:7px 10px; border-radius:10px; }
      .clock strong { font-size:22px; font-variant-numeric:tabular-nums; } .actions { flex-wrap:wrap; justify-content:flex-start; }
      h3 { margin:12px 0 8px; font-size:15px; } .grades { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; }
      .grades button { display:grid; justify-items:center; align-content:start; gap:2px; text-align:center; padding:6px 2px; min-width:0; transition:transform 150ms ease,box-shadow 150ms ease,background 150ms ease; } .grades button:hover:not(:disabled), .grades button:focus-visible { transform:translateY(-3px); box-shadow:0 5px 12px #245d4033; border-color:#6da98a; background:#f0f8f3; } @media(prefers-reduced-motion:reduce){.grades button{transition:none;}.grades button:hover:not(:disabled),.grades button:focus-visible{transform:none;}}
      .grades button[aria-pressed=true] { border-color:#287655; background:#e8f5ed; box-shadow:inset 0 0 0 1px #287655; }
      .face { font-size:25px; } small { color:#4b6357; font-size:12px; }
      label { display:block; margin:8px 0; } details { margin:8px 0; } summary { cursor:pointer; font-weight:650; }
      textarea { margin-top:7px; width:100%; min-height:64px; resize:vertical; background:#f5f8f6; border:1px solid #c9dcd0; border-radius:10px; color:inherit; font:inherit; padding:9px; }
      .panel-footer { position:sticky; bottom:-12px; padding:8px 0 12px; background:#fff; }
      .save { width:100%; background:#21634d; color:white; font-weight:700; } .status { margin:8px 0 0; overflow-wrap:anywhere; } .status.saved { font-weight:750;color:#174d38; }
    `;
    root.append(style);
    const node = (tag, text, parent, cls) => {
      const element = document.createElement(tag);
      if (tag === "button") element.type = "button";
      if (cls) element.className = cls;
      if (text) element.textContent = text;
      parent.append(element);
      return element;
    };
    const trigger = node("button", "", root, "trigger");
    const logo = node("span", "", trigger, "logo");
    const icon = node("img", "", logo);
    icon.src = chrome.runtime.getURL("recallcode-logo.png");
    icon.alt = "";
    node("span", "RecallCode", trigger);
    trigger.setAttribute("aria-label", "RecallCode 计时与评分");
    trigger.setAttribute("aria-expanded", "false");
    const panel = node("section", "", root, "panel");
    panel.setAttribute("popover", "auto");
    panel.setAttribute("aria-label", "RecallCode 训练记录");
    const header = node("header", "", panel);
    const title = node("strong", "RecallCode", header);
    const close = node("button", "关闭", header);
    close.onclick = () => panel.hidePopover();
    const clock = node("div", "", panel, "clock");
    const clockLabel = node("span", "◷ 未开始", clock);
    const clockValue = node("strong", "0:00", clock);
    const actions = node("div", "", panel, "actions");
    const timerButton = node("button", "开始计时", actions);
    const finish = node("button", "结束计时", actions);
    const discard = node("button", "结束且不记录", actions);
    node("h3", "这道题，你掌握得怎么样？", panel);
    const grid = node("div", "", panel, "grades");
    const hintLabel = node("label", "", panel);
    const hint = node("input", "", hintLabel);
    hint.type = "checkbox";
    hintLabel.append(" 本次查看过提示或题解");
    const notes = node("details", "", panel);
    node("summary", "添加学习笔记", notes);
    const noteHeading = node("div", "", notes, "note-heading");
    node("span", "学习笔记", noteHeading);
    const noteStatus = node("small", "仅自己可见", noteHeading);
    const note = node("textarea", "", notes);
    note.setAttribute("aria-label", "学习笔记");
    note.placeholder = "记下关键思路、边界条件或易错点…";
    note.maxLength = 20000;
    const footer = node("div", "", panel, "panel-footer");
    const save = node("button", "保存本次记录 →", footer, "save");
    const status = node("p", "", footer, "status");
    status.setAttribute("role", "status");

    let session,
      selected,
      busy = false,
      ended = false,
      savedSeconds = 0;
    let draftQueue = Promise.resolve();
    let draftVersion = 0;
    const send = async (action, extra = {}) => {
      const response = await chrome.runtime.sendMessage({
        type: "recallcode",
        action,
        slug,
        title:
          document.querySelector("h1")?.textContent ||
          document.title.replace(/\s*[-|｜].*$/, ""),
        ...extra,
      });
      if (!response?.ok) throw Error(response?.error || "插件通信失败");
      return response.value;
    };
    const buttons = grades.map(([grade, face, description]) => {
      const button = node("button", "", grid);
      button.setAttribute("aria-label", grade + " " + description);
      node("span", face, button, "face").setAttribute("aria-hidden", "true");
      node("strong", grade, button);
      node("small", description, button);
      button.onclick = () => {
        selected = grade;
        render();
      };
      return button;
    });
    function render() {
      const running = session?.status === "running";
      const extra = running
        ? Math.max(
            0,
            Math.min(
              15,
              (Math.min(
                Date.now(),
                Date.parse(session.lastActivityAt ?? session.startedAt) +
                  300000,
              ) -
                Date.parse(session.updatedAt)) /
                1000,
            ),
          )
        : 0;
      const seconds = Math.min(
        7200,
        Math.floor((session?.activeSeconds ?? savedSeconds) + extra),
      );
      const time =
        Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
      clockLabel.textContent = running
        ? "◷ 计时中"
        : ended
          ? "✓ 本次计时已结束"
          : session
            ? "◷ 已暂停"
            : "◷ 未开始";
      clockValue.textContent = time;
      trigger.dataset.running = String(running);
      trigger.title = running
        ? "RecallCode · 计时中 " + time
        : "RecallCode · 计时与评分";
      timerButton.textContent = running
        ? "暂停计时"
        : session
          ? "继续计时"
          : "开始计时";
      timerButton.disabled = busy;
      finish.disabled = busy || !running;
      discard.hidden = !session;
      discard.disabled = busy;
      save.disabled = busy || !selected;
      buttons.forEach((button, index) => {
        button.disabled = busy;
        button.setAttribute(
          "aria-pressed",
          String(selected === grades[index][0]),
        );
      });
    }
    async function ensureSession() {
      if (!session) {
        // A direct rating or note starts a paused record, without counting idle time.
        const created = await send("start");
        session = await send("pause", { sessionId: created.id });
      }
      return session;
    }
    async function run(fn) {
      if (busy) return;
      busy = true;
      status.textContent = "";
      status.classList.remove("saved");
      render();
      try {
        await fn();
      } catch (error) {
        status.textContent = error.message;
      } finally {
        busy = false;
        render();
      }
    }
    timerButton.onclick = () =>
      run(async () => {
        await draftQueue.catch(() => {});
        session = session
          ? await send(session.status === "running" ? "pause" : "resume", {
              sessionId: session.id,
            })
          : await send("start");
        ended = false;
      });
    finish.onclick = () =>
      run(async () => {
        session = await send("pause", { sessionId: session.id });
        ended = true;
      });
    discard.onclick = () =>
      run(async () => {
        await draftQueue.catch(() => {});
        if (!session) return;
        await send("cancel", { sessionId: session.id });
        session = undefined;
        selected = undefined;
        ended = false;
        savedSeconds = 0;
        note.value = "";
        hint.checked = false;
        notes.open = false;
        noteStatus.textContent = "仅自己可见";
        status.textContent = "已结束，未记入学习记录";
      });
    function saveDraft(field) {
      const version = ++draftVersion;
      noteStatus.textContent = "保存中…";
      const value =
        field === "note" ? { note: note.value } : { usedHint: hint.checked };
      draftQueue = draftQueue
        .catch(() => {})
        .then(async () => {
          const active = await ensureSession();
          await send("draft", { sessionId: active.id, ...value });
        });
      draftQueue.then(
        () => {
          if (version === draftVersion) noteStatus.textContent = "已自动保存";
          render();
        },
        (error) => {
          if (version === draftVersion)
            noteStatus.textContent = "保存失败：" + error.message;
        },
      );
    }
    note.oninput = () => saveDraft("note");
    hint.onchange = () => saveDraft("hint");
    save.onclick = () =>
      run(async () => {
        await draftQueue.catch(() => {});
        const active = await ensureSession();
        await send("draft", { sessionId: active.id, note: note.value });
        await send("draft", { sessionId: active.id, usedHint: hint.checked });
        const result = await send("rate", {
          sessionId: active.id,
          rating: selected,
        });
        savedSeconds = result.activeSeconds;
        session = undefined;
        ended = true;
        selected = undefined;
        status.textContent =
          "已保存" +
          (result.nextDueDate ? " · 下次复习 " + result.nextDueDate : "");
        status.classList.add("saved");
      });
    function position() {
      if (!panel.matches(":popover-open")) return;
      const rect = trigger.getBoundingClientRect();
      panel.style.top = Math.min(rect.bottom + 8, innerHeight - 72) + "px";
      panel.style.left =
        Math.max(
          8,
          Math.min(
            rect.right - panel.offsetWidth,
            innerWidth - panel.offsetWidth - 8,
          ),
        ) + "px";
    }
    trigger.onclick = () => {
      panel.togglePopover();
      position();
    };
    panel.addEventListener("toggle", () => {
      trigger.setAttribute(
        "aria-expanded",
        String(panel.matches(":popover-open")),
      );
    });
    window.addEventListener("resize", position);
    toolbarAnchor(submit).after(host);
    render();
    send("identify")
      .then((problem) => {
        title.textContent = problem.title;
        if (!session && !busy && !draftVersion && !ended) {
          session = problem.session;
          note.value = session?.note ?? "";
          hint.checked = session?.usedHint ?? false;
          notes.open = Boolean(note.value);
          if (note.value) noteStatus.textContent = "已自动保存";
        }
        render();
      })
      .catch((error) => {
        status.textContent = error.message;
      });
    let lastActivity = 0;
    const activity = (event) => {
      if (
        !event.isTrusted ||
        session?.status !== "running" ||
        Date.now() - lastActivity < 5000
      )
        return;
      lastActivity = Date.now();
      send("activity", { sessionId: session.id }).catch(() => {});
    };
    document.addEventListener("keydown", activity);
    document.addEventListener("pointerdown", activity);
    const display = setInterval(render, 250);
    const heartbeat = setInterval(async () => {
      if (
        busy ||
        session?.status !== "running" ||
        document.visibilityState !== "visible"
      )
        return;
      const id = session.id;
      try {
        const next = await send("heartbeat", { sessionId: id });
        if (session?.id === id && !busy) {
          session = next;
          render();
        }
      } catch {}
    }, 5000);
    return {
      slug,
      submit,
      host,
      cleanup() {
        clearInterval(display);
        clearInterval(heartbeat);
        window.removeEventListener("resize", position);
        document.removeEventListener("keydown", activity);
        document.removeEventListener("pointerdown", activity);
        host.remove();
      },
    };
  }
  function sync() {
    const slug = currentSlug();
    const submit = !disabled && slug && submitButton();
    if (
      mounted &&
      (mounted.slug !== slug ||
        mounted.submit !== submit ||
        !mounted.host.isConnected)
    ) {
      mounted.cleanup();
      mounted = undefined;
    }
    if (!mounted && submit) mounted = mount(slug, submit);
  }
  chrome.storage.local.get("inlineDisabled").then((result) => {
    disabled = Boolean(result.inlineDisabled);
    sync();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.inlineDisabled) return;
    disabled = Boolean(changes.inlineDisabled.newValue);
    sync();
  });
  setInterval(sync, 750);
})();
