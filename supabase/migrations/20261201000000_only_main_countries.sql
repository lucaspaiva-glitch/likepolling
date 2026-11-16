-- Like Polling follows 14 countries everywhere (lib/countries.js): erase every other country's data.
create temporary table main_cc (cc text primary key) on commit drop;
insert into main_cc values ('BR'), ('PT'), ('US'), ('ES'), ('FR'), ('DE'), ('GB'), ('JP'), ('KR'), ('RU'), ('UA'), ('MX'), ('IN'), ('CN');

delete from public.wiki_top_daily where country_code not in (select cc from main_cc);
delete from public.youtube_music_chart_history where country_code not in (select cc from main_cc);
delete from public.youtube_trending_history where country_code not in (select cc from main_cc);
delete from public.youtube_music_chart where country_code not in (select cc from main_cc);
delete from public.youtube_trending where country_code not in (select cc from main_cc);
delete from public.news_world_history where country_code not in (select cc from main_cc);
delete from public.news_archive where country_code not in (select cc from main_cc);
delete from public.gdelt_country_daily where country_code not in (select cc from main_cc);
delete from public.gdelt_pairs_daily where actor1_cc not in (select cc from main_cc) or actor2_cc not in (select cc from main_cc);
delete from public.education_subjects_history where country_code not in (select cc from main_cc);
delete from public.education_videos_history where country_code not in (select cc from main_cc);
delete from public.education_subjects where country_code not in (select cc from main_cc);
delete from public.education_videos where country_code not in (select cc from main_cc);
delete from public.trends_daily where country_code not in (select cc from main_cc);
delete from public.news_coverage_monthly where country_code not in (select cc from main_cc);
delete from public.holidays where country_code not in (select cc from main_cc);
delete from public.github_new_devs_weekly where country_code not in (select cc from main_cc);
delete from public.fashion_videos where country_code not in (select cc from main_cc);
delete from public.report_insights where country_code not in (select cc from main_cc);
delete from public.reading_daily where country_code not in (select cc from main_cc);
delete from public.interest_daily where country_code not in (select cc from main_cc);
delete from public.youtube_active_users where country_code not in (select cc from main_cc);
-- The monthly top 100 AI projects stay whole; only the builder's country is forgotten.
update public.github_ai_builders_monthly set country_code = null where country_code not in (select cc from main_cc);
