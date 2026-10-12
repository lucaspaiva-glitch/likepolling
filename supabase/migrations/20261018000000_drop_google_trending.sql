-- Removes the unused "Most Talked About, According to Google" widget's
-- table and write function (widget taken down at the owner's request).
drop function if exists public.replace_google_trending(jsonb);
drop table if exists public.google_trending;
