import { useEffect, useState } from "react";

export function Integration() {
  const [enabled, setEnabled] = useState<boolean>();
  const [error, setError] = useState("");
  useEffect(() => {
    chrome.storage.local
      .get("inlineDisabled")
      .then((result) => setEnabled(!result.inlineDisabled))
      .catch((error) => setError(String(error)));
  }, []);
  return (
    <section>
      <h2>力扣工具栏</h2>
      <label>
        <input
          type="checkbox"
          checked={enabled ?? false}
          disabled={enabled === undefined}
          onChange={(event) => {
            const next = event.target.checked;
            chrome.storage.local
              .set({ inlineDisabled: !next })
              .then(() => setEnabled(next))
              .catch((error) => setError(String(error)));
          }}
        />
        在提交右侧显示 RecallCode
      </label>
      {error && <p role="status">{error}</p>}
    </section>
  );
}
