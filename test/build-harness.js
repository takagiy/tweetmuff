// Generates the browser harness payloads from synthetic fixtures.
// Run: bun test/build-harness.js, then bun test/harness-server.js, and open http://localhost:8765/
import fs from 'node:fs';
import path from 'node:path';
import { sampleTimeline, muteList, homeTimeline, tweetEntry, tweet, user } from './fixtures.js';

const root = path.join(import.meta.dir, 'harness');
const write = (rel, data) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data));
};
const { data, total, muted } = sampleTimeline();
write('i/api/graphql/q/HomeTimeline.json', data);
write('i/api/1.1/mutes/keywords/list.json', muteList(['spoiler', 'ネタバレ', 'sample']));
// A mute list in a format tweetmuff doesn't recognize: not imported, and noted in the problem log.
write('i/api/1.1/mutes/keywords/list.bad.json', { muted_keywords: [{ text: 'spoiler' }] });
// An operation that isn't on the allowlist: passed through unfiltered.
write('i/api/graphql/q/SomethingNew.json', data);
// Nothing to filter: fetch must hand back X's original response untouched.
write('i/api/graphql/clean/HomeTimeline.json', homeTimeline([tweetEntry(tweet({ text: 'nothing to see' }))]));
// The signed-in user (twid u=4242, set by index.html) never has their own posts hidden.
write('i/api/graphql/self/HomeTimeline.json', homeTimeline([
  tweetEntry(tweet({ text: 'my own spoiler', author: user({ id: '4242' }) })),
  tweetEntry(tweet({ text: 'their spoiler' })),
]));
write('expected.json', { total: total + 2, afterFilter: total + 2 - muted }); // +2 cursors
for (const f of ['core.js', 'main.js']) fs.copyFileSync(path.join(import.meta.dir, '../src', f), path.join(root, f));
console.log('harness ready:', root);
