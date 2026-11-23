-- Private mail routing. Values are supplied with a separate server-only operation.
create table calendar_private.server_config (
 singleton boolean primary key default true check(singleton),
 admin_email text not null,
 site_url text not null check(site_url like 'https://%')
);
alter table calendar_private.server_config enable row level security;
revoke all on calendar_private.server_config from public,anon,authenticated;
grant select on calendar_private.server_config to service_role;
create function public.disclosure_calendar_server_config() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('adminEmail',admin_email,'siteUrl',site_url) from calendar_private.server_config where singleton;
$$;
revoke all on function public.disclosure_calendar_server_config() from public,anon,authenticated;
grant execute on function public.disclosure_calendar_server_config() to service_role;
