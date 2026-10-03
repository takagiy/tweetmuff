'use strict';
// The popup shows counts only; the words themselves live on the options page so they aren't in view every time.

onStateChange((state) => {
  byId('enabled').checked = state.enabled;
  byId('applyToFollowing').checked = state.applyToFollowing;
  byId('syncStatus').textContent = syncStatus(state);
  byId('localStatus').textContent = state.local.length ? `${pluralize(state.local.length, 'extra word')} added here` : '';
});

bindCheckbox('enabled', 'enabled');
bindCheckbox('applyToFollowing', 'applyToFollowing');

byId('editWords').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});
byId('openSettings').addEventListener('click', () => {
  openXMuteSettings();
  window.close();
});
