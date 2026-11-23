-- Apply ONLY to the previous shared financial-app project, not the new calendar project.
-- Preserve archived rows; revoke the former calendar client's access.
revoke all on public.disclosure_calendar_entries from public,anon,authenticated;
revoke all on function public.disclosure_calendar_apply(jsonb) from public,anon,authenticated;
