const test = require('node:test');
const assert = require('node:assert/strict');
const CP = require('../extension/lib/core.js');

test('pageKind recognises channel, video and Shorts pages only on YouTube', () => {
  assert.deepEqual(CP.pageKind('https://www.youtube.com/@MrBeast/videos'), { type: 'channel', ref: { handle: 'MrBeast' } });
  assert.deepEqual(CP.pageKind('https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA'), { type: 'channel', ref: { id: 'UCX6OQ3DkcsbYNE6H8uQQuVA' } });
  assert.deepEqual(CP.pageKind('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3'), { type: 'watch', videoId: 'dQw4w9WgXcQ' });
  assert.equal(CP.pageKind('https://www.youtube.com/shorts/abcdefghijk').type, 'shorts');
  assert.equal(CP.pageKind('https://www.youtube.com/feed/trending').type, 'other');
  assert.equal(CP.pageKind('https://example.com/@MrBeast').type, 'other');
});

test('owner links become channel refs and query strings', () => {
  assert.deepEqual(CP.channelRefFromHref('/@felipeneto'), { handle: 'felipeneto' });
  assert.equal(CP.refQuery({ handle: 'MrBeast' }), 'handle=%40MrBeast');
  assert.equal(CP.channelRefFromHref('/watch?v=x'), null);
});

test('language comes from the browser, with every string translated', () => {
  assert.equal(CP.detectLang(['pt-PT', 'en']), 'pt-PT');
  assert.equal(CP.detectLang(['fr-FR', 'de-DE']), 'de');
  assert.equal(CP.detectLang(['fr-FR']), 'en');
  for (const lang of CP.LANGS) {
    const t = CP.translator(lang);
    for (const key of ['creators', 'views30', 'in_countries', 'w_title', 'speed_h', 'education', 'edu_subjects', 'n_videos', 's_exams_admissions', 'no_edu']) assert.ok(t(key) && t(key) !== key, `${lang}:${key}`);
  }
});
