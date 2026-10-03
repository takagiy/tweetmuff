'use strict';

onStateChange((state) => {
  byId('enabled').checked = state.enabled;
  byId('applyToFollowing').checked = state.applyToFollowing;
  byId('syncStatus').textContent = syncStatus(state);
  byId('importedList').replaceChildren(...state.imported.map((rule) => {
    const item = document.createElement('li');
    item.textContent = rule.keyword;
    if (rule.excludeFollowing) {
      item.className = 'following';
      item.title = 'Excludes accounts you follow';
    }
    return item;
  }));
  // Don't overwrite the box while the user is typing in it.
  if (document.activeElement !== byId('local')) byId('local').value = state.local.map((rule) => rule.keyword).join('\n');
});

bindCheckbox('enabled', 'enabled');
bindCheckbox('applyToFollowing', 'applyToFollowing');

byId('openSettings').addEventListener('click', openXMuteSettings);

byId('saveLocal').addEventListener('click', async () => {
  const lines = byId('local').value.split('\n').map((line) => line.trim()).filter(Boolean);
  const words = [...new Set(lines)];
  await updateState({ local: words.map((keyword) => ({ keyword, excludeFollowing: false })) });
  byId('saved').hidden = false;
  setTimeout(() => {
    byId('saved').hidden = true;
  }, 1500);
});

// ---------- Status: problems tweetmuff ran into on X ----------
// The bridge stores only fixed error codes ({ feature, step, kind }); these turn them into words.

const VERSION = chrome.runtime.getManifest().version;
const FEATURE_NAMES = {
  home: 'Home timeline',
  replies: 'Replies and "Discover more"',
  search: 'Search results',
  suggestions: 'Search suggestions',
  profiles: 'Profiles',
  explore: 'Explore and trends',
  notifications: 'Notifications',
  bookmarks: 'Bookmarks',
  lists: 'Lists',
  other: 'Other timelines',
  settings: 'Settings',
  import: 'Importing muted words from X',
  network: "Watching X's requests",
};
const STEP_DESCRIPTIONS = {
  entries: "Couldn't read some items in X's response; they were shown unfiltered.",
  suggestions: "Couldn't read some search suggestions; they were shown unfiltered.",
  response: "Couldn't process X's response; it was shown unfiltered.",
  settings: "Couldn't load the saved settings.",
  format: "X's muted-words list came in an unknown format, so the saved list was kept.",
  import: "Couldn't read X's muted-words list, so the saved list was kept.",
  hook: "Couldn't watch one of X's requests; it was left as it was.",
};
let problems = [];

// Only this version's well-formed records.
function currentProblems(stored) {
  const records = Array.isArray(stored) ? stored : [];
  return records
    .filter((record) => record && record.version === VERSION && TweetmuffCore.isProblem(record))
    .map((record) => ({
      feature: record.feature,
      step: record.step,
      kind: record.kind,
      count: Number(record.count) || 1,
      lastSeen: Number(record.lastSeen) || 0,
    }));
}

function formatDate(timestamp) {
  return timestamp ? new Date(timestamp).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';
}

function renderProblems(stored) {
  problems = currentProblems(stored);
  byId('statusOk').hidden = problems.length > 0;
  byId('statusProblems').hidden = problems.length === 0;
  byId('problemList').replaceChildren(...problems.map((problem) => {
    const item = document.createElement('li');
    const feature = document.createElement('div');
    feature.className = 'feature';
    feature.textContent = FEATURE_NAMES[problem.feature];
    const description = document.createElement('div');
    description.textContent = `${STEP_DESCRIPTIONS[problem.step]} (${problem.kind})`;
    const seen = document.createElement('div');
    seen.className = 'muted small';
    const times = problem.count === 1 ? 'once' : `${problem.count} times`;
    seen.textContent = `Seen ${times}, last on ${formatDate(problem.lastSeen)}`;
    item.append(feature, description, seen);
    return item;
  }));
}

function reportText() {
  const chromeVersion = navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] || '?';
  const platform = navigator.userAgentData?.platform;
  const lines = [`tweetmuff ${VERSION} problem report`, `Browser: Chrome ${chromeVersion}${platform ? ` on ${platform}` : ''}`, ''];
  problems.forEach((problem, index) => {
    const lastSeen = new Date(problem.lastSeen).toISOString().slice(0, 10);
    const times = `${problem.count} time${problem.count === 1 ? '' : 's'}`;
    lines.push(`${index + 1}. ${FEATURE_NAMES[problem.feature]}: ${STEP_DESCRIPTIONS[problem.step]}`);
    lines.push(`   Code: ${problem.feature}/${problem.step}/${problem.kind}. Seen ${times}, last on ${lastSeen}.`);
  });
  lines.push('', 'This report has only problem codes: no posts, muted words, or account details.');
  return lines.join('\n');
}

byId('copyReport').addEventListener('click', async () => {
  const text = reportText();
  try {
    await navigator.clipboard.writeText(text);
    byId('copied').hidden = false;
    setTimeout(() => {
      byId('copied').hidden = true;
    }, 1500);
  } catch {
    // Clipboard unavailable: show the text so it can be copied by hand.
    const fallback = byId('reportFallback');
    fallback.value = text;
    fallback.hidden = false;
    fallback.select();
  }
});

byId('clearProblems').addEventListener('click', () => chrome.storage.local.remove('problems'));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.problems) renderProblems(changes.problems.newValue);
});
chrome.storage.local.get('problems').then(({ problems: stored }) => renderProblems(stored));
