const configure = () =>
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(console.error);
chrome.runtime.onInstalled.addListener(configure);
chrome.runtime.onStartup.addListener(configure);
void configure();
import "./background-messages";
