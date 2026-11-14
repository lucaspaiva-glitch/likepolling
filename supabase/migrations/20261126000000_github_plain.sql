-- AI Builders: plain-language title and sentence per project in every site language, written by Gemini
-- in scripts/github-routine.js: { "en": { "t": "...", "d": "..." }, "pt": {...}, ... }.
alter table public.github_ai_repos_weekly add column if not exists plain jsonb;
