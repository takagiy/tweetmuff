// tweetmuff bridge (isolated world): relays between chrome.storage and the MAIN-world hook.
// The hook needs rules synchronously at document_start, so the state is mirrored into x.com's localStorage.
// Loaded after src/core.js.
(function () {
  "use strict";
  const core = globalThis.TweetmuffCore;
  const STATE_KEY = "tweetmuff:state";
  const DEFAULT_STATE = {
    enabled: true,
    applyToFollowing: false,
    imported: [],
    local: [],
    lastSync: 0,
  };
  const VERSION = chrome.runtime.getManifest().version;
  const MAX_PROBLEMS = 20;

  function mirrorToPage(state) {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch {
      // Site data can be blocked; the page then keeps the rules it already had.
    }
    document.dispatchEvent(new CustomEvent("tweetmuff:state"));
  }

  async function getState() {
    const { state } = await chrome.storage.local.get("state");
    return { ...DEFAULT_STATE, ...(state || {}) };
  }

  async function updateState(changes) {
    const state = await getState();
    await chrome.storage.local.set({ state: { ...state, ...changes } });
  }

  function problemCode(problem) {
    return `${problem.feature}/${problem.step}/${problem.kind}`;
  }

  // Keeps a short log of problems for the options page: one record per distinct { feature, step, kind } in this
  // version, newest first. Only codes from core's fixed lists are accepted, so nothing else from the page is stored.
  async function recordProblem(problem) {
    if (!core.isProblem(problem)) return;
    const { problems } = await chrome.storage.local.get("problems");
    const saved = Array.isArray(problems) ? problems : [];
    const records = saved.filter(
      (record) =>
        record && record.version === VERSION && core.isProblem(record),
    );
    const now = Date.now();
    const existing = records.find(
      (record) => problemCode(record) === problemCode(problem),
    );
    if (existing) {
      existing.count = (Number(existing.count) || 1) + 1;
      existing.lastSeen = now;
    } else {
      records.push({
        feature: problem.feature,
        step: problem.step,
        kind: problem.kind,
        version: VERSION,
        count: 1,
        firstSeen: now,
        lastSeen: now,
      });
    }
    records.sort((a, b) => b.lastSeen - a.lastSeen);
    await chrome.storage.local.set({
      problems: records.slice(0, MAX_PROBLEMS),
    });
  }

  // Storage calls start failing when the extension is reloaded or updated under an open tab; that tab simply keeps
  // its last rules until it is reloaded.
  getState()
    .then(mirrorToPage)
    .catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.state)
      mirrorToPage({ ...DEFAULT_STATE, ...changes.state.newValue });
  });

  // Listens for a message from the MAIN-world hook (sent as a JSON string in a CustomEvent's detail).
  function onPageMessage(eventName, handle) {
    document.addEventListener(eventName, (event) => {
      let message;
      try {
        message = JSON.parse(event.detail);
      } catch {
        return;
      }
      if (message && typeof message === "object")
        handle(message).catch(() => {});
    });
  }

  onPageMessage("tweetmuff:imported", async (message) => {
    if (Array.isArray(message.rules))
      await updateState({
        imported: message.rules,
        lastSync: Number(message.at) || Date.now(),
      });
  });
  onPageMessage("tweetmuff:problem", recordProblem);
})();
