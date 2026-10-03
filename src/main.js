// tweetmuff page hook (runs in the page's MAIN world at document_start).
// 1. Filters timeline API responses before X's app sees them, so muted posts are never rendered at all.
// 2. Imports X's own muted-keyword list by reading the response whenever X itself fetches it.
// tweetmuff never makes API requests of its own and never touches X's DOM, so changes to X's markup can't break it.
// Fail-safe by design: whenever something unexpected happens, tweetmuff steps aside and X gets its data unchanged.
(function () {
  'use strict';
  const core = window.TweetmuffCore;
  if (window.__tweetmuff || !core) return;
  window.__tweetmuff = true;

  const STATE_KEY = 'tweetmuff:state';

  // Each distinct problem is reported once per page: a console note for whoever is debugging locally, plus fixed error
  // codes ({ feature, step, kind }, no message or data) the bridge keeps for the options page's Status section.
  const reportedProblems = new Set();
  function report(error, feature, step) {
    try {
      const problem = core.problemOf(error, feature, step);
      const code = `${problem.feature}/${problem.step}/${problem.kind}`;
      if (reportedProblems.has(code)) return;
      reportedProblems.add(code);
      console.warn(`[tweetmuff] ${code}: left part of X's data unfiltered because it looked unexpected.`, error);
      sendToBridge('tweetmuff:problem', problem);
    } catch {}
  }

  // ---------- settings (written by the isolated-world bridge into localStorage) ----------
  let matcher = core.compile(null);

  function loadSettings() {
    try {
      matcher = core.compile(JSON.parse(localStorage.getItem(STATE_KEY) || 'null'));
    } catch (error) {
      report(error, 'settings', 'settings');
    }
  }

  // The signed-in user's id, so their own posts are never hidden. Read with the Cookie Store API, which returns only
  // the twid cookie; document.cookie would hand over every readable cookie, including X's CSRF token.
  let selfId = null;
  async function readSelfId() {
    try {
      const cookie = await window.cookieStore?.get('twid');
      const value = cookie ? decodeURIComponent(cookie.value).replace(/^"|"$/g, '') : '';
      const match = value.match(/u=(\d+)/);
      selfId = match ? match[1] : null;
    } catch {
      selfId = null;
    }
  }
  readSelfId();
  try {
    // Signed out or switched accounts.
    window.cookieStore?.addEventListener('change', (event) => {
      const changed = [...event.changed, ...event.deleted];
      if (changed.some((cookie) => cookie.name === 'twid')) readSelfId();
    });
  } catch {}

  // ---------- response filtering (only the requests listed in core's GRAPHQL_FEATURES / REST_FEATURES) ----------

  // Filters a parsed response in place; returns how many items were removed.
  function filterResponse(response, feature) {
    if (core.isEmpty(matcher)) return 0;
    const onError = (error, step = 'response') => report(error, feature, step);
    try {
      return core.filterPayload(response, matcher, { selfId, onError });
    } catch (error) {
      onError(error);
      return 0;
    }
  }

  // Returns the filtered JSON text, or the original text whenever it isn't JSON or nothing was removed.
  function filterResponseText(text, feature) {
    if (core.isEmpty(matcher) || typeof text !== 'string' || !text || text[0] !== '{') return text;
    let response;
    try {
      response = JSON.parse(text);
    } catch {
      return text;
    }
    return filterResponse(response, feature) ? JSON.stringify(response) : text;
  }

  // ---------- XMLHttpRequest ----------
  const xhrPrototype = XMLHttpRequest.prototype;
  const originalOpen = xhrPrototype.open;
  const responseTextProperty = Object.getOwnPropertyDescriptor(xhrPrototype, 'responseText');
  const responseProperty = Object.getOwnPropertyDescriptor(xhrPrototype, 'response');
  const REQUEST_INFO = Symbol('tweetmuff');

  xhrPrototype.open = function (method, url) {
    try {
      // original/filtered cache the result so every read of the response returns the same value.
      this[REQUEST_INFO] = { feature: core.filteredFeature(url), original: undefined, filtered: undefined };
      if (core.isMuteListRequest(url)) {
        this.addEventListener('load', () => {
          if (this.status !== 200) return;
          let json;
          try {
            json = JSON.parse(responseTextProperty.get.call(this));
          } catch {
            return;
          }
          importMuteList(json);
        });
      }
    } catch (error) {
      report(error, 'network', 'hook');
    }
    return originalOpen.apply(this, arguments);
  };

  function filteredXhrResponse(xhr, original) {
    try {
      const info = xhr[REQUEST_INFO];
      if (!info || !info.feature || xhr.readyState !== 4) return original;
      if (info.original === original && info.filtered !== undefined) return info.filtered;
      let filtered = original;
      if (typeof original === 'string') {
        filtered = filterResponseText(original, info.feature);
      } else if (original && Object.getPrototypeOf(original) === Object.prototype) {
        // responseType 'json': filter a copy, so X's own object is never left half-edited.
        const copy = structuredClone(original);
        if (filterResponse(copy, info.feature)) filtered = copy;
      }
      info.original = original;
      info.filtered = filtered;
      return filtered;
    } catch (error) {
      report(error, xhr[REQUEST_INFO]?.feature, 'response');
      return original;
    }
  }

  Object.defineProperty(xhrPrototype, 'responseText', {
    configurable: true,
    enumerable: responseTextProperty.enumerable,
    get() {
      return filteredXhrResponse(this, responseTextProperty.get.call(this));
    },
  });
  Object.defineProperty(xhrPrototype, 'response', {
    configurable: true,
    enumerable: responseProperty.enumerable,
    get() {
      return filteredXhrResponse(this, responseProperty.get.call(this));
    },
  });

  // ---------- fetch ----------
  const originalFetch = window.fetch;
  window.fetch = async function (input) {
    const response = await originalFetch.apply(this, arguments);
    let feature = null;
    try {
      let url = '';
      if (typeof input === 'string') url = input;
      else if (input instanceof URL) url = input.href;
      else if (input?.url) url = input.url;

      if (core.isMuteListRequest(url) && response.ok) response.clone().json().then(importMuteList, () => {});
      feature = core.filteredFeature(url);
      if (!feature || core.isEmpty(matcher) || !response.ok) return response;
      if (!(response.headers.get('content-type') || '').includes('json')) return response;

      // Read a clone, so the original response is still intact to hand back if anything goes wrong.
      const text = await response.clone().text();
      const filteredText = filterResponseText(text, feature);
      if (filteredText === text) return response;
      const filtered = new Response(filteredText, { status: response.status, statusText: response.statusText, headers: response.headers });
      Object.defineProperty(filtered, 'url', { value: response.url });
      return filtered;
    } catch (error) {
      report(error, feature, 'response');
      return response;
    }
  };

  // ---------- import of X's own mute settings ----------
  function sendToBridge(eventName, detail) {
    document.dispatchEvent(new CustomEvent(eventName, { detail: JSON.stringify(detail) }));
  }

  function importMuteList(json) {
    try {
      const rules = core.fromXMuteList(json);
      if (rules) sendToBridge('tweetmuff:imported', { rules, at: Date.now() });
      else report({ name: 'UnknownFormat' }, 'import', 'format'); // the saved list was kept
    } catch (error) {
      report(error, 'import', 'import');
    }
  }

  // ---------- init ----------
  loadSettings();
  document.addEventListener('tweetmuff:state', loadSettings);
})();
