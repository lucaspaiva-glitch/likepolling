// The 14 countries Like Polling follows everywhere: homepage sections, reports and data jobs.
const MAIN = ['BR', 'PT', 'US', 'ES', 'FR', 'DE', 'GB', 'JP', 'KR', 'RU', 'UA', 'MX', 'IN', 'CN'];
const isMain = (cc) => MAIN.includes(String(cc || '').toUpperCase());
const onlyMain = (obj) => Object.fromEntries(Object.entries(obj).filter(([cc]) => isMain(cc)));

module.exports = { MAIN, isMain, onlyMain };
