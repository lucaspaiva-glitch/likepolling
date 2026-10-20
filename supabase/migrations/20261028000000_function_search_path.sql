-- Pin search_path on the two functions flagged by Supabase's
-- "function_search_path_mutable" security check. Both bodies already use
-- schema-qualified names (public.*), so an empty search_path is safe.
begin;

alter function public.youtube_diurnal_weight(timestamp) set search_path = '';
alter function public.refresh_youtube_active_users() set search_path = '';

select public.refresh_youtube_active_users();

commit;
