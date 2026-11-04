const configure = () =>
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(console.error);
chrome.runtime.onInstalled.addListener(() => {
  void configure();
  // Replace the opt-in registration shipped in previous builds.
  void chrome.scripting
    .getRegisteredContentScripts({ ids: ["recallcode-inline"] })
    .then((scripts) =>
      scripts.length
        ? chrome.scripting.unregisterContentScripts({
            ids: ["recallcode-inline"],
          })
        : undefined,
    )
    .catch(console.error);
});
chrome.runtime.onStartup.addListener(configure);
void configure();
import "./background-messages";
