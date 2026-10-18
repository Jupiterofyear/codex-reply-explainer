import { renderMarkdown } from "./markdown.mjs";
window.chrome.webview.addEventListener("message", event => {
  document.querySelector("#explanation").innerHTML = renderMarkdown(event.data.text);
});
