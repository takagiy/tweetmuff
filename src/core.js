// tweetmuff core: keyword matching and API-response filtering.
// Pure logic with no DOM / chrome.* dependency so it can run in the page's MAIN world and in tests.
(function (root) {
  'use strict';

  const ASCII_WORD_CHAR = /[a-z0-9_]/;
  const URL_PATTERN = /https?:\/\/\S+/g;

  function normalize(text) {
    return String(text).normalize('NFKC').toLowerCase();
  }

  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // A keyword becomes one regex source.
  // - "/.../" is treated as a raw regex (only for locally added words).
  // - Edges that are ASCII word chars get word boundaries, so "cat" does not hit "category" but does hit "catで" or "#cat".
  // - Non-ASCII (e.g. Japanese) is plain substring, like X does.
  function keywordSource(keyword) {
    const trimmed = String(keyword).trim();
    if (trimmed.length > 2 && trimmed.startsWith('/') && trimmed.endsWith('/')) {
      const pattern = trimmed.slice(1, -1);
      try {
        new RegExp(pattern, 'u');
        return pattern;
      } catch {
        return null;
      }
    }
    const word = normalize(trimmed);
    if (!word) return null;
    let source = escapeRegExp(word);
    if (ASCII_WORD_CHAR.test(word[0])) source = '(?<![a-z0-9_])' + source;
    if (ASCII_WORD_CHAR.test(word[word.length - 1])) source = source + '(?![a-z0-9_])';
    return source;
  }

  // Keeps only well-formed rules, so a corrupted or unexpected value drops that rule instead of throwing.
  function normalizeRules(rules) {
    if (!Array.isArray(rules)) return [];
    const valid = [];
    for (const rule of rules) {
      if (!rule || typeof rule.keyword !== 'string' || !rule.keyword.trim()) continue;
      const validUntil = rule.validUntil == null ? NaN : Number(rule.validUntil);
      valid.push({
        keyword: rule.keyword,
        excludeFollowing: rule.excludeFollowing === true,
        validUntil: validUntil > 0 ? validUntil : null,
      });
    }
    return valid;
  }

  // The settings shape everything else relies on: { enabled, applyToFollowing, imported, local, lastSync }.
  function normalizeState(state) {
    const saved = state && typeof state === 'object' ? state : {};
    return {
      enabled: saved.enabled !== false,
      applyToFollowing: saved.applyToFollowing === true,
      imported: normalizeRules(saved.imported),
      local: normalizeRules(saved.local),
      lastSync: Number.isFinite(saved.lastSync) ? saved.lastSync : 0,
    };
  }

  // Builds the matcher: one pattern for words that always apply, one for words that skip followed accounts.
  function compile(state, now = Date.now()) {
    const settings = normalizeState(state);
    const always = [];
    const unlessFollowing = [];
    if (settings.enabled) {
      for (const rule of [...settings.imported, ...settings.local]) {
        if (rule.validUntil && rule.validUntil < now) continue;
        const source = keywordSource(rule.keyword);
        if (!source) continue;
        if (rule.excludeFollowing && !settings.applyToFollowing) unlessFollowing.push(source);
        else always.push(source);
      }
    }
    return { always: anyOf(always), unlessFollowing: anyOf(unlessFollowing) };
  }

  // One combined regex is fastest. If user regexes can't be combined (e.g. clashing group names), test them one by
  // one rather than losing all of them.
  function anyOf(sources) {
    if (!sources.length) return null;
    try {
      return new RegExp(sources.map((source) => `(?:${source})`).join('|'), 'u');
    } catch {
      const patterns = sources.map((source) => new RegExp(source, 'u'));
      return { test: (text) => patterns.some((pattern) => pattern.test(text)) };
    }
  }

  function isEmpty(matcher) {
    return !matcher.always && !matcher.unlessFollowing;
  }

  function cleanText(text) {
    return normalize(String(text || '').replace(URL_PATTERN, ' '));
  }

  // --- tweet extraction (GraphQL shape) ---

  function unwrapTweet(result) {
    if (!result) return null;
    if (result.__typename === 'TweetWithVisibilityResults' && result.tweet) return result.tweet;
    if (result.__typename === 'Tweet' || result.legacy || result.rest_id) return result;
    return null;
  }

  function tweetAuthor(tweet) {
    return tweet?.core?.user_results?.result || null;
  }

  function isFollowing(user) {
    if (!user) return false;
    return !!(user.relationship_perspectives?.following ?? user.legacy?.following);
  }

  function cardText(tweet) {
    const bindings = tweet?.card?.legacy?.binding_values;
    if (!Array.isArray(bindings)) return '';
    const texts = [];
    for (const binding of bindings) {
      const isTextField = /^(title|description|vanity_url)$/.test(binding?.key);
      if (isTextField && binding.value?.string_value) texts.push(binding.value.string_value);
    }
    return texts.join('\n');
  }

  // Each "segment" is one authored piece of text: the tweet itself, its quoted tweet, the retweeted original.
  // Following-exemption is decided per segment author.
  function tweetSegments(tweetResult, segments = [], depth = 0) {
    const tweet = unwrapTweet(tweetResult);
    if (!tweet || depth > 4) return segments;
    const legacy = tweet.legacy || {};
    const retweeted = legacy.retweeted_status_result?.result;
    if (retweeted) {
      // A retweet's own full_text is just "RT @x: <truncated>", the original carries the real text.
      tweetSegments(retweeted, segments, depth + 1);
    } else {
      const author = tweetAuthor(tweet);
      const article = tweet.article?.article_results?.result;
      const texts = [
        tweet.note_tweet?.note_tweet_results?.result?.text || legacy.full_text || '',
        cardText(tweet),
        article?.title || '',
        article?.preview_text || '',
      ];
      segments.push({
        userId: author?.rest_id || legacy.user_id_str,
        following: isFollowing(author),
        text: cleanText(texts.join('\n')),
      });
    }
    const quoted = tweet.quoted_status_result?.result;
    if (quoted) tweetSegments(quoted, segments, depth + 1);
    return segments;
  }

  // Whether one segment should be muted. The user's own posts never are.
  function segmentMuted(segment, matcher, selfId) {
    if (selfId && segment.userId === selfId) return false;
    if (matcher.always && matcher.always.test(segment.text)) return true;
    return !!(matcher.unlessFollowing && !segment.following && matcher.unlessFollowing.test(segment.text));
  }

  function judgeText(text, matcher) {
    const cleaned = cleanText(text);
    const always = matcher.always && matcher.always.test(cleaned);
    const unlessFollowing = matcher.unlessFollowing && matcher.unlessFollowing.test(cleaned);
    return !!(always || unlessFollowing);
  }

  // Non-tweet timeline items that carry their own text (trends, Explore news/event cards).
  function itemTexts(item) {
    if (item.itemType === 'TimelineTrend' || item.__typename === 'TimelineTrend') {
      return [item.name, item.social_context?.text, item.trend_metadata?.meta_description, item.trend_metadata?.domain_context];
    }
    if (item.itemType === 'TimelineEventSummary' || item.__typename === 'TimelineEventSummary') {
      const promoted = item.promotedMetadata || {};
      return [item.title, promoted.promotedTrendName, promoted.promotedTrendDescription];
    }
    return null;
  }

  // Walks any subtree and judges every tweet / trend / event card found in it.
  function subtreeMuted(node, context) {
    let muted = false;
    const visit = (value, depth) => {
      if (muted || !value || typeof value !== 'object' || depth > 40) return;
      if (Array.isArray(value)) {
        for (const child of value) visit(child, depth + 1);
        return;
      }
      if (value.tweet_results && typeof value.tweet_results === 'object') {
        const segments = tweetSegments(value.tweet_results.result);
        if (segments.some((segment) => segmentMuted(segment, context.matcher, context.selfId))) {
          muted = true;
          return;
        }
      }
      const texts = itemTexts(value);
      if (texts && judgeText(texts.filter(Boolean).join('\n'), context.matcher)) {
        muted = true;
        return;
      }
      for (const key in value) {
        if (key !== 'tweet_results') visit(value[key], depth + 1);
      }
    };
    visit(node, 0);
    return muted;
  }

  // Runs one step of the filter. If it throws (a response shape tweetmuff doesn't understand), that step is skipped,
  // i.e. the item is kept as X sent it, and the rest of the response is still filtered. step is one of STEPS.
  function attempt(context, step, run, fallback) {
    try {
      return run();
    } catch (error) {
      context.onError(error, step);
      return fallback;
    }
  }

  // Removes items for which isMuted() is true; an item that can't be judged stays.
  function keep(context, step, items, isMuted) {
    const kept = items.filter((item) => !attempt(context, step, () => isMuted(item), false));
    context.removed += items.length - kept.length;
    return kept;
  }

  // A conversation module (home-conversation-*, conversationthread-*) is dropped as a whole when any tweet
  // in it matches; dropping just one item would leave a dangling thread line.
  // Other modules are lists of independent items ("Discover more" under a post, carousels): only the matching
  // items go, and the module goes too once it is empty so no bare header is left.
  function entryMuted(entry, context) {
    if (isCursor(entry)) return false;
    const content = entry?.content;
    const isList = Array.isArray(content?.items) && content.items.length && !/Conversation/.test(content.displayType || '');
    if (isList) {
      content.items = keep(context, 'entries', content.items, (item) => subtreeMuted(item, context));
      return content.items.length === 0;
    }
    return subtreeMuted(entry, context);
  }

  function filterInstructions(instructions, context) {
    for (let i = instructions.length - 1; i >= 0; i--) {
      const instruction = instructions[i];
      if (!instruction || typeof instruction !== 'object') continue;
      if (Array.isArray(instruction.entries)) {
        instruction.entries = keep(context, 'entries', instruction.entries, (entry) => entryMuted(entry, context));
      }
      if (Array.isArray(instruction.moduleItems)) {
        const before = instruction.moduleItems.length;
        instruction.moduleItems = keep(context, 'entries', instruction.moduleItems, (item) => subtreeMuted(item, context));
        if (!instruction.moduleItems.length && before) instructions.splice(i, 1);
      }
      const singleEntry = instruction.entry;
      if (singleEntry && attempt(context, 'entries', () => !isCursor(singleEntry) && subtreeMuted(singleEntry, context), false)) {
        instructions.splice(i, 1);
        context.removed++;
      }
    }
  }

  function isCursor(entry) {
    const content = entry?.content;
    if (!content) return false;
    return content.entryType === 'TimelineTimelineCursor' || content.__typename === 'TimelineTimelineCursor' || !!content.cursorType;
  }

  // Search-box suggestions (/1.1/search/typeahead.json). Users are left alone, like X's own mute.
  function filterTypeahead(response, context) {
    if (!('num_results' in response && 'ordered_sections' in response)) return;
    const removedBefore = context.removed;
    for (const section of ['topics', 'hashtags', 'events']) {
      if (!Array.isArray(response[section])) continue;
      response[section] = keep(context, 'suggestions', response[section], (suggestion) => {
        const texts = [];
        JSON.stringify(suggestion, (key, value) => {
          if (typeof value === 'string' && !/url|id$|_str$/i.test(key)) texts.push(value);
          return value;
        });
        return judgeText(texts.join('\n'), context.matcher);
      });
    }
    const removed = context.removed - removedBefore;
    if (removed && typeof response.num_results === 'number') response.num_results -= removed;
  }

  // Mutates the response in place and returns how many entries/items were removed. A response shape it doesn't
  // understand never makes it throw: those parts are left as X sent them, and each problem is reported to
  // options.onError(error, step).
  function filterPayload(response, matcher, options = {}) {
    if (!response || typeof response !== 'object' || isEmpty(matcher)) return 0;
    const context = { matcher, selfId: options.selfId || null, removed: 0, onError: options.onError || (() => {}) };
    attempt(context, 'suggestions', () => filterTypeahead(response, context));
    const seen = new Set();
    const visit = (value, depth) => {
      if (!value || typeof value !== 'object' || depth > 30 || seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) {
        for (const child of value) visit(child, depth + 1);
        return;
      }
      for (const key in value) {
        const child = value[key];
        if (key === 'instructions' && Array.isArray(child)) attempt(context, 'entries', () => filterInstructions(child, context));
        else visit(child, depth + 1);
      }
    };
    attempt(context, 'entries', () => visit(response, 0));
    return context.removed;
  }

  // X's mute-list API -> our rule format. Returns null (keep the list already saved) when the response isn't
  // recognizable, e.g. X renamed a field, instead of replacing the user's list with nothing or with junk.
  function fromXMuteList(json) {
    const entries = json?.muted_keywords;
    if (!Array.isArray(entries)) return null;
    const rules = normalizeRules(entries.map((entry) => ({
      keyword: entry?.keyword,
      excludeFollowing: Array.isArray(entry?.mute_options) && entry.mute_options.includes('exclude_following_accounts'),
      validUntil: entry?.valid_until,
    })));
    return entries.length && !rules.length ? null : rules;
  }

  // --- problem log (shown on the options page's Status section) ---
  // A problem is recorded only as codes from these fixed lists. No error message, URL, or anything else taken from
  // X's data is kept, so the log never holds user data and a copied report is safe to post publicly.
  const FEATURES = ['home', 'replies', 'search', 'suggestions', 'profiles', 'explore', 'notifications', 'bookmarks', 'lists', 'other',
    'settings', 'import', 'network'];
  const STEPS = ['entries', 'suggestions', 'response', 'settings', 'format', 'import', 'hook'];
  const KINDS = ['TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'URIError', 'DataCloneError', 'UnknownFormat', 'Error'];

  // --- the requests tweetmuff filters (keep in sync with PRIVACY.md) ---
  // Only these are filtered; every other request passes through untouched. GraphQL URLs look like
  // https://x.com/i/api/graphql/<query id>/<operation>, where the query id changes with X's releases.
  const GRAPHQL_FEATURES = {
    HomeTimeline: 'home',
    HomeLatestTimeline: 'home',
    TweetDetail: 'replies',
    SearchTimeline: 'search',
    UserTweets: 'profiles',
    UserTweetsAndReplies: 'profiles',
    UserMedia: 'profiles',
    Likes: 'profiles',
    UserHighlightsTweets: 'profiles',
    UserArticlesTweets: 'profiles',
    UserOriginalsTimeline: 'profiles',
    UserRepliesTimeline: 'profiles',
    UserRepostsTimeline: 'profiles',
    UserPhotoTimeline: 'profiles',
    UserVideoTimeline: 'profiles',
    UserSuperFollowTweets: 'profiles',
    ListLatestTweetsTimeline: 'lists',
    ListRankedTweetsTimeline: 'lists',
    Bookmarks: 'bookmarks',
    BookmarkFolderTimeline: 'bookmarks',
    BookmarkSearchTimeline: 'bookmarks',
    ExplorePage: 'explore',
    ExploreSidebar: 'explore',
    GenericTimelineById: 'explore',
    NotificationsTimeline: 'notifications',
  };
  const REST_FEATURES = { '/i/api/1.1/search/typeahead.json': 'suggestions' };
  const MUTE_LIST_PATH = '/i/api/1.1/mutes/keywords/list.json';

  // Parses a request URL relative to x.com; null if it isn't a valid URL.
  function parseRequestUrl(url) {
    try {
      return new URL(String(url), 'https://x.com');
    } catch {
      return null;
    }
  }

  // The feature (an id from FEATURES) a request is filtered for, or null if tweetmuff leaves it alone.
  function filteredFeature(url) {
    const parsed = parseRequestUrl(url);
    if (!parsed || parsed.hostname !== 'x.com') return null;
    const graphql = parsed.pathname.match(/^\/i\/api\/graphql\/[\w-]+\/(\w+)$/);
    if (graphql) {
      const operation = graphql[1];
      return Object.hasOwn(GRAPHQL_FEATURES, operation) ? GRAPHQL_FEATURES[operation] : null;
    }
    return Object.hasOwn(REST_FEATURES, parsed.pathname) ? REST_FEATURES[parsed.pathname] : null;
  }

  // X's own request for the user's muted-word list, whose response tweetmuff reads to import the list.
  function isMuteListRequest(url) {
    const parsed = parseRequestUrl(url);
    return !!parsed && parsed.hostname === 'x.com' && parsed.pathname === MUTE_LIST_PATH;
  }

  // Reduces an error to { feature, step, kind } codes; the error's message is never looked at.
  function problemOf(error, feature, step) {
    return {
      feature: FEATURES.includes(feature) ? feature : 'other',
      step: STEPS.includes(step) ? step : 'response',
      kind: KINDS.includes(error?.name) ? error.name : 'Error',
    };
  }

  function isProblem(problem) {
    return !!problem && FEATURES.includes(problem.feature) && STEPS.includes(problem.step) && KINDS.includes(problem.kind);
  }

  const api = {
    normalize, keywordSource, normalizeState, compile, isEmpty, judgeText, cleanText, tweetSegments, filterPayload, fromXMuteList,
    filteredFeature, isMuteListRequest, problemOf, isProblem,
    filteredOperations: Object.keys(GRAPHQL_FEATURES), // checked against PRIVACY.md by the tests
  };
  root.TweetmuffCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
