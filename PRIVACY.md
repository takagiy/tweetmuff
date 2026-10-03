# Privacy Policy — tweetmuff

**Extension:** tweetmuff
**Last updated:** 2026-10-03

tweetmuff works only on x.com. It handles the data below only to filter posts and to show its own status on its settings page. It never sends anything anywhere: it makes no network requests of its own and has no server.

- **Personally identifiable information**
  - X account ID (the numeric ID in X's `twid` cookie): read so that your own posts are never hidden. tweetmuff reads only this one cookie.
- **Website content**: read in the page before X displays it, to remove items that contain your muted words.
  - Posts in timelines: home, profiles, lists, bookmarks, and notifications
  - Replies and "Discover more" under a post
  - Search results, and search suggestions (topics, hashtags, and events)
  - Trends and Explore news cards
  - Your muted-word list on X, when X's web app loads it (for example on Settings › Muted words), to know which words to filter
- **User activity**: tweetmuff checks the addresses of the requests X's web app makes to find the ones below, and removes items that contain your muted words from their responses. Every other request is left alone. `{ID}` stands for an identifier that changes with X's updates.
  - `x.com/i/api/graphql/{ID}/HomeTimeline`: home timeline (For you)
  - `x.com/i/api/graphql/{ID}/HomeLatestTimeline`: home timeline (Following)
  - `x.com/i/api/graphql/{ID}/TweetDetail`: a post's replies and "Discover more"
  - `x.com/i/api/graphql/{ID}/SearchTimeline`: search results
  - `x.com/i/api/graphql/{ID}/UserTweets`: a profile's posts
  - `x.com/i/api/graphql/{ID}/UserTweetsAndReplies`: a profile's posts and replies
  - `x.com/i/api/graphql/{ID}/UserMedia`: a profile's media
  - `x.com/i/api/graphql/{ID}/Likes`: a profile's likes
  - `x.com/i/api/graphql/{ID}/UserHighlightsTweets`: a profile's highlights
  - `x.com/i/api/graphql/{ID}/UserArticlesTweets`: a profile's articles
  - `x.com/i/api/graphql/{ID}/UserOriginalsTimeline`: a profile's original posts
  - `x.com/i/api/graphql/{ID}/UserRepliesTimeline`: a profile's replies
  - `x.com/i/api/graphql/{ID}/UserRepostsTimeline`: a profile's reposts
  - `x.com/i/api/graphql/{ID}/UserPhotoTimeline`: a profile's photos
  - `x.com/i/api/graphql/{ID}/UserVideoTimeline`: a profile's videos
  - `x.com/i/api/graphql/{ID}/UserSuperFollowTweets`: a profile's subscriber-only posts
  - `x.com/i/api/graphql/{ID}/ListLatestTweetsTimeline`: a list's latest posts
  - `x.com/i/api/graphql/{ID}/ListRankedTweetsTimeline`: a list's top posts
  - `x.com/i/api/graphql/{ID}/Bookmarks`: your bookmarks
  - `x.com/i/api/graphql/{ID}/BookmarkFolderTimeline`: a bookmark folder
  - `x.com/i/api/graphql/{ID}/BookmarkSearchTimeline`: bookmark search results
  - `x.com/i/api/graphql/{ID}/ExplorePage`: the Explore page
  - `x.com/i/api/graphql/{ID}/ExploreSidebar`: trends and news in the sidebar
  - `x.com/i/api/graphql/{ID}/GenericTimelineById`: Explore tabs and trend timelines
  - `x.com/i/api/graphql/{ID}/NotificationsTimeline`: notifications
  - `x.com/i/api/1.1/search/typeahead.json`: search suggestions
  - `x.com/i/api/1.1/mutes/keywords/list.json`: your muted-word list, to import it

tweetmuff doesn't handle health, financial or payment, authentication, personal communications, location, or web history data. It reads no passwords, auth cookies, tokens, or request headers, doesn't touch direct messages, and keeps no list of the pages you visit.

## Stored on your device

In the extension's storage in your browser:

- Your settings (on/off, "apply to accounts you follow") and the extra muted words you add on the settings page
- The muted-word list imported from X
- A short problem log: when tweetmuff runs into a problem, it saves a fixed code such as `home/entries/TypeError`, with the extension version, how often it happened, and when. It holds no messages, posts, words, links, or account details. You can see it in the Status section of the settings page, copy it to report a problem, or clear it.

A copy of your settings and words is also kept in x.com's site data in your browser, so the filter is ready as soon as the page starts loading.

Nothing else is stored. In particular, your account ID, the posts tweetmuff reads, and X's requests are never stored.

## Limited Use

tweetmuff's use of the data above complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. The data is used only to filter posts on X and show the extension's status. It isn't sold or transferred, isn't used for advertising or to determine creditworthiness or lending, and isn't read by anyone.

## Permissions

- `storage`: saves your settings, muted words, and problem log in your browser.
- Content scripts on `https://x.com/*`: filter posts on X.

tweetmuff uses no third-party services (analytics, error reporting, advertising, or tracking) and loads no remote code.

## Deleting your data

Removing the extension deletes its storage. The **Clear** button in the settings page's Status section deletes the problem log on its own. The copy in x.com's site data is removed when you clear site data for x.com.

## Changes

If this policy changes, this file is updated in place and the **Last updated** date above is revised. The current version is always at <https://github.com/takagiy/tweetmuff/blob/main/PRIVACY.md>.

## Contact

Issues, questions, or concerns: <https://github.com/takagiy/tweetmuff/issues>
