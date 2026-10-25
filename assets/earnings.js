// Estimated monthly ad earnings (USD) from a channel's last-30-day uploads. Shared by index.html, api/metrics.js and api/v1.js.
// RPM (USD per 1,000 views): long videos by the channel's country group, Shorts (<= 3 min) at the Shorts rate,
// times a topic factor from each video's YouTube category. Typical creator-reported rates, not YouTube's real payouts.
(function (root) {
  'use strict';
  const SHORTS_MAX_S = 180;
  const TIER1 = ['US', 'GB', 'CA', 'AU', 'NZ', 'DE', 'NL', 'BE', 'CH', 'AT', 'IE', 'SE', 'NO', 'DK', 'FI', 'FR', 'JP', 'SG'];
  const TIER3 = ['IN', 'PK', 'BD', 'NG', 'EG', 'ID', 'PH', 'VN', 'KE', 'DZ', 'MA', 'IQ'];
  const LONG = { 1: [3, 5], 2: [1.2, 2], 3: [0.45, 0.75] };
  const SHORTS = [0.04, 0.07];
  const HIGH_TOPICS = ['26', '27', '28'];   // Howto & Style, Education, Science & Technology
  const LOW_TOPICS = ['10', '20', '23'];    // Music, Gaming, Comedy
  const tier = (country) => (TIER1.includes(country) ? 1 : TIER3.includes(country) ? 3 : 2);
  const topic = (cat) => (HIGH_TOPICS.includes(String(cat)) ? 1.3 : LOW_TOPICS.includes(String(cat)) ? 0.7 : 1);

  // videos: stored compact rows ({ v: views, d: seconds, k: categoryId }) or API rows ({ views, duration_s, category_id }).
  function estimate(views30, videos, country) {
    const total = Number(views30 || 0);
    const group = tier(String(country || '').toUpperCase());
    const long = LONG[group];
    let low = 0, high = 0, sum = 0, shortViews = 0;
    for (const vid of videos || []) {
      const n = Number(vid.v ?? vid.views ?? 0);
      if (!n) continue;
      const d = vid.d ?? vid.duration_s;
      const isShort = d != null && d <= SHORTS_MAX_S;
      const rate = isShort ? SHORTS : long;
      const m = topic(vid.k ?? vid.category_id);
      low += n * rate[0] * m; high += n * rate[1] * m; sum += n;
      if (isShort) shortViews += n;
    }
    const rpmLow = sum ? low / sum : long[0], rpmHigh = sum ? high / sum : long[1];
    return {
      low: Math.round((total / 1000) * rpmLow), high: Math.round((total / 1000) * rpmHigh),
      rpm_low: Math.round(rpmLow * 100) / 100, rpm_high: Math.round(rpmHigh * 100) / 100,
      country_group: group, shorts_share: sum ? Math.round((shortViews / sum) * 100) / 100 : null,
    };
  }

  const api = { estimate, tier, SHORTS_MAX_S, LONG, SHORTS };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.LPEarnings = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
