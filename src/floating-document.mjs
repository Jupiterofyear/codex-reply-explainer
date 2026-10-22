import { renderMarkdown, renderMessages } from "./markdown.mjs";
let page;
const positions = new Map();
window.chrome.webview.addEventListener("message", event => {
  const changed = page !== event.data.page;
  if (changed) positions.set(page, window.scrollY);
  const host = document.querySelector("#explanation");
  if (event.data.messages) {
    host.replaceChildren(...renderMessages(event.data.messages, event.data.partial).map(message => {
      const section = document.createElement("section");
      const heading = document.createElement("h3");
      heading.textContent = message.role === "user" ? "你" : "回答";
      const body = document.createElement("div");
      body.innerHTML = message.html;
      section.append(heading, body);
      return section;
    }));
  } else host.innerHTML = renderMarkdown(event.data.text);
  if (changed) window.scrollTo(0, positions.get(event.data.page) || 0);
  page = event.data.page;
});
