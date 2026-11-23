-- Additive approval gate. Apply after calendar-schema.sql.
create schema if not exists calendar_private;
revoke all on schema calendar_private from public, anon, authenticated;
grant usage on schema calendar_private to service_role;

create table public.disclosure_calendar_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','approved','rejected','suspended')),
 decided_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.disclosure_calendar_members enable row level security;
revoke all on public.disclosure_calendar_members from public, anon, authenticated;
grant select on public.disclosure_calendar_members to authenticated;
grant all on public.disclosure_calendar_members to service_role;
create policy calendar_member_read_own on public.disclosure_calendar_members
 for select to authenticated using(user_id=(select auth.uid()));

create table calendar_private.approval_tickets (
 user_id uuid primary key references auth.users(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 applicant_email text not null,
 expires_at timestamptz not null,
 issued_at timestamptz not null default now(),
 mail_state text not null default 'sending' check(mail_state in ('sending','sent','failed')),
 consumed_at timestamptz,
 decision text check(decision in ('approve','reject'))
);
alter table calendar_private.approval_tickets enable row level security;
grant all on calendar_private.approval_tickets to service_role;
revoke all on calendar_private.approval_tickets from public, anon, authenticated;

create table calendar_private.approval_audit (
 id bigint generated always as identity primary key,
 user_id uuid not null,
 action text not null,
 created_at timestamptz not null default now()
);
alter table calendar_private.approval_audit enable row level security;
grant all on calendar_private.approval_audit to service_role;
grant usage,select on sequence calendar_private.approval_audit_id_seq to service_role;
revoke all on calendar_private.approval_audit from public, anon, authenticated;

create function public.disclosure_calendar_access_status() returns text
language sql stable security invoker set search_path='' as $$
 select coalesce((select status from public.disclosure_calendar_members where user_id=(select auth.uid())),'pending');
$$;
revoke all on function public.disclosure_calendar_access_status() from public,anon;
grant execute on function public.disclosure_calendar_access_status() to authenticated;

-- All old and new accounts require a server-side approval record. No user metadata is trusted.
drop policy calendar_read_own on public.disclosure_calendar_entries;
drop policy calendar_insert_own on public.disclosure_calendar_entries;
drop policy calendar_update_own on public.disclosure_calendar_entries;
create policy calendar_read_approved_own on public.disclosure_calendar_entries for select to authenticated
 using(user_id=(select auth.uid()) and (select public.disclosure_calendar_access_status())='approved');
create policy calendar_insert_approved_own on public.disclosure_calendar_entries for insert to authenticated
 with check(user_id=(select auth.uid()) and (select public.disclosure_calendar_access_status())='approved');
create policy calendar_update_approved_own on public.disclosure_calendar_entries for update to authenticated
 using(user_id=(select auth.uid()) and (select public.disclosure_calendar_access_status())='approved')
 with check(user_id=(select auth.uid()) and (select public.disclosure_calendar_access_status())='approved');

-- Service-only functions: not callable with a publishable key or a user's JWT.
create function public.disclosure_calendar_issue_approval(target_user uuid, digest text, verified_email text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare ticket calendar_private.approval_tickets; member_status text;
begin
 -- Only service_role can call this; the Edge Function verifies getUser before supplying this email.
 if verified_email is null or length(verified_email)>254 or verified_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Verified email required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(873625419);
 if (select count(*) from calendar_private.approval_audit where created_at>now()-interval '1 hour' and action='approval_requested')>=20 then raise exception 'Request cooldown' using errcode='P0001'; end if;
 insert into public.disclosure_calendar_members(user_id) values(target_user) on conflict do nothing;
 select status into member_status from public.disclosure_calendar_members where user_id=target_user for update;
 if member_status <> 'pending' then raise exception 'Account not pending' using errcode='42501'; end if;
 select * into ticket from calendar_private.approval_tickets where user_id=target_user;
 if ticket.issued_at > now()-interval '15 minutes' then raise exception 'Request cooldown' using errcode='P0001'; end if;
 insert into calendar_private.approval_tickets(user_id,token_hash,applicant_email,expires_at)
 values(target_user,digest,verified_email,now()+interval '24 hours')
 on conflict(user_id) do update set token_hash=excluded.token_hash,applicant_email=excluded.applicant_email,expires_at=excluded.expires_at,issued_at=now(),mail_state='sending',consumed_at=null,decision=null;
 insert into calendar_private.approval_audit(user_id,action) values(target_user,'approval_requested');
 return jsonb_build_object('email',verified_email);
end; $$;

create function public.disclosure_calendar_mark_mail(target_user uuid, digest text, delivered boolean)
returns void language sql security invoker set search_path='' as $$
 update calendar_private.approval_tickets set mail_state=case when delivered then 'sent' else 'failed' end
 where user_id=target_user and token_hash=digest and consumed_at is null;
$$;

create function public.disclosure_calendar_review_approval(digest text, decision text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare ticket calendar_private.approval_tickets; applicant_email text;
begin
 if decision is not null and decision not in ('approve','reject') then raise exception 'Invalid decision'; end if;
 select * into ticket from calendar_private.approval_tickets where token_hash=digest for update;
 if not found or ticket.expires_at<=now() or ticket.consumed_at is not null or ticket.mail_state<>'sent' then
  raise exception 'Invalid or expired approval link' using errcode='42501';
 end if;
 applicant_email:=ticket.applicant_email;
 if decision is not null then
  update public.disclosure_calendar_members set status=case when decision='approve' then 'approved' else 'rejected' end,decided_at=now()
  where user_id=ticket.user_id and status='pending';
  if not found then raise exception 'Account not pending' using errcode='42501'; end if;
  update calendar_private.approval_tickets set consumed_at=now(),decision=disclosure_calendar_review_approval.decision where user_id=ticket.user_id;
  insert into calendar_private.approval_audit(user_id,action) values(ticket.user_id,case when decision='approve' then 'approved_via_email' else 'rejected_via_email' end);
 end if;
 return jsonb_build_object('email',applicant_email,'userId',ticket.user_id,'issuedAt',ticket.issued_at,'decision',decision);
end; $$;
revoke all on function public.disclosure_calendar_issue_approval(uuid,text,text),public.disclosure_calendar_mark_mail(uuid,text,boolean),public.disclosure_calendar_review_approval(text,text) from public,anon,authenticated;
grant execute on function public.disclosure_calendar_issue_approval(uuid,text,text),public.disclosure_calendar_mark_mail(uuid,text,boolean),public.disclosure_calendar_review_approval(text,text) to service_role;

-- No automatic approval of existing accounts; an approval email is required.
comment on table public.disclosure_calendar_members is 'Server-managed approval gate; user metadata never grants access.';
