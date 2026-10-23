import { renderMarkdown, renderMessages, formatDuration } from "./markdown.mjs";
let page, activity;
const activityElement = document.querySelector("#question-activity");
const activityLabel = activityElement.querySelector(".activity-label");
const activityTime = activityElement.querySelector(".activity-time");
function updateActivityTime() {
  if (activity) activityTime.textContent = "· " + formatDuration(Date.now() - Date.parse(activity.startedAt));
  for (const timer of document.querySelectorAll(".thinking-time[data-started-at]")) timer.textContent = " · " + formatDuration(Date.now() - Date.parse(timer.dataset.startedAt));
}
setInterval(updateActivityTime, 1000);
const positions = new Map();
let userCount = 0, following = true, scrolling = false;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const atBottom = () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 48;
function scrollToBottom(smooth) {
  const top = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  scrolling = smooth && !reducedMotion.matches && Math.abs(top - window.scrollY) > 1;
  window.scrollTo({ top, behavior: scrolling ? "smooth" : "instant" });
}
window.addEventListener("scroll", () => { if (!scrolling) following = atBottom(); }, { passive: true });
window.addEventListener("scrollend", () => { scrolling = false; following = atBottom(); });
const stopFollowing = () => {
  scrolling = false;
  following = false;
  window.scrollTo({ top: window.scrollY, behavior: "instant" });
};
window.addEventListener("wheel", stopFollowing, { passive: true });
window.addEventListener("touchstart", stopFollowing, { passive: true });
window.addEventListener("pointerdown", () => { if (scrolling) stopFollowing(); });
window.addEventListener("keydown", event => {
  if (["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"].includes(event.key)) stopFollowing();
});
window.addEventListener("resize", () => { if (page?.startsWith("questions-") && following) scrollToBottom(false); });
window.chrome.webview.addEventListener("message", event => {
  if (event.data.fontSizes) {
    document.documentElement.style.fontSize = event.data.fontSizes.sans + "px";
    document.documentElement.style.setProperty("--code-font-size", event.data.fontSizes.code + "px");
    if (page?.startsWith("questions-") && following) scrollToBottom(false);
    return;
  }
  activity = event.data.activity;
  activityElement.hidden = !activity || !!event.data.thinking?.length;
  if (activity) {
    if (activityLabel.textContent !== activity.label) activityLabel.textContent = activity.label;
    updateActivityTime();
  }
  const changed = page !== event.data.page;
  if (changed) positions.set(page, { top: window.scrollY, following });
  const host = document.querySelector("#explanation");
  if (event.data.messages) {
    const count = event.data.messages.filter(message => message.role === "user").length;
    const sent = !changed && count > userCount;
    if (changed) { host.replaceChildren(); following = positions.get(event.data.page)?.following ?? true; }
    const messages = renderMessages(event.data.messages, event.data.partial, event.data.thinking);
    messages.forEach((message, index) => {
      let section = host.children[index];
      if (!section) {
        section = document.createElement("section");
        section.className = "message " + (message.role === "user" ? "user" : "assistant");
        section.setAttribute("aria-label", message.role === "user" ? "你" : "回答");
        section.append(document.createElement("div"));
        host.append(section);
        if (!changed && !reducedMotion.matches) section.animate(
          [{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "translateY(0)" }],
          { duration: 150, easing: "cubic-bezier(.4,0,.2,1)" });
      }
      if (section.dataset.html !== message.html) {
        section.firstElementChild.innerHTML = message.html;
        section.dataset.html = message.html;
      }
    });
    while (host.children.length > messages.length) host.lastElementChild.remove();
    userCount = count;
    if (sent) following = true;
    if (changed && !following) window.scrollTo({ top: positions.get(event.data.page).top, behavior: "instant" });
    else if (following) scrollToBottom(sent || scrolling);
  } else host.innerHTML = renderMarkdown(event.data.text);
  if (changed && !event.data.messages) window.scrollTo(0, positions.get(event.data.page)?.top || 0);
  page = event.data.page;
});
