// Shared by the popup and the options page. Loaded after src/core.js.
'use strict';
const X_MUTE_SETTINGS_URL = 'https://x.com/settings/muted_keywords';

function byId(id) {
  return document.getElementById(id);
}

// Always the expected shape, even if what's stored is damaged, so the pages still render.
async function getState() {
  const { state } = await chrome.storage.local.get('state');
  return TweetmuffCore.normalizeState(state);
}

async function updateState(changes) {
  const state = await getState();
  await chrome.storage.local.set({ state: { ...state, ...changes } });
}

function onStateChange(render) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.state) render(TweetmuffCore.normalizeState(changes.state.newValue));
  });
  getState().then(render);
}

function formatTime(timestamp) {
  return timestamp ? new Date(timestamp).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '';
}

function pluralize(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function syncStatus(state) {
  if (!state.lastSync) return "Not synced yet. Open X's muted words settings once to import them.";
  return `${pluralize(state.imported.length, 'word')} from X, synced ${formatTime(state.lastSync)}`;
}

// Saves a checkbox to the boolean setting with the given name whenever it's toggled.
function bindCheckbox(id, settingName) {
  byId(id).addEventListener('change', (event) => updateState({ [settingName]: event.target.checked }));
}

// X loads the list itself on this page; tweetmuff only reads that response.
function openXMuteSettings() {
  chrome.tabs.create({ url: X_MUTE_SETTINGS_URL });
}
