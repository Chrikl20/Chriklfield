-- Supabase projects can retain TRUNCATE/REFERENCES/TRIGGER grants even when
-- automatic Data API exposure is disabled. RLS does not protect TRUNCATE.
-- Scope this correction to application tables; preserve platform-owned schemas.
do $$ declare t text; begin
 foreach t in array array[
  'workspaces','memberships','project_limits','model_prices','characters',
  'character_versions','quotes','jobs','assets','character_references',
  'reservations','credit_ledger','outbox','provider_attempts','webhook_inbox',
  'payments','refund_events','templates','alerts','audit_log','deletion_requests',
  'request_counters','upload_intents'
 ] loop
  execute format('revoke all on table public.%I from public,anon,authenticated',t);
  execute format('grant all on table public.%I to service_role',t);
 end loop;
end $$;
grant select on public.workspaces,public.memberships,public.characters,
 public.character_versions,public.quotes,public.jobs,public.assets,
 public.character_references,public.reservations,public.credit_ledger,
 public.deletion_requests,public.templates,public.model_prices to authenticated;
alter default privileges in schema public revoke all on tables from public,anon,authenticated;

-- Keep the RLS helper outside exposed API schemas. Moving the function preserves
-- its OID, so existing table and Storage policy dependencies continue to work.
create schema if not exists creator_private;
revoke all on schema creator_private from public,anon,authenticated;
grant usage on schema creator_private to authenticated,service_role;
alter function public.is_member(uuid) set schema creator_private;
create or replace function creator_private.is_member(w uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.memberships m
  join public.workspaces ws on ws.id=m.workspace_id
  where m.workspace_id=w and m.user_id=(select auth.uid()) and ws.deleted_at is null
 )
$$;
revoke all on function creator_private.is_member(uuid) from public,anon,authenticated;
grant execute on function creator_private.is_member(uuid) to authenticated,service_role;

-- Optional dashboard-created RLS event trigger: clients never need to call it.
-- Only change this known event-trigger signature, not arbitrary existing functions.
do $$ begin
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='rls_auto_enable' and p.pronargs=0
     and p.prorettype='event_trigger'::regtype) then
  revoke all on function public.rls_auto_enable() from public,anon,authenticated;
 end if;
end $$;

-- Cover the foreign keys flagged by the hosted database advisor. These indexes
-- support membership lookup, workspace filtering and media/deletion joins.
create index alerts_workspace_idx on public.alerts(workspace_id);
create index assets_character_workspace_idx on public.assets(character_id,workspace_id);
create index assets_job_workspace_idx on public.assets(job_id,workspace_id);
create index references_asset_workspace_idx on public.character_references(asset_id,workspace_id);
create index references_character_workspace_idx on public.character_references(character_id,workspace_id);
create index references_workspace_idx on public.character_references(workspace_id);
create index versions_character_workspace_idx on public.character_versions(character_id,workspace_id);
create index versions_config_workspace_idx on public.character_versions(config_asset_id,workspace_id);
create index versions_weights_workspace_idx on public.character_versions(weights_asset_id,workspace_id);
create index versions_workspace_idx on public.character_versions(workspace_id);
create index characters_workspace_idx on public.characters(workspace_id);
create index ledger_job_idx on public.credit_ledger(job_id);
create index ledger_workspace_idx on public.credit_ledger(workspace_id);
create index deletions_workspace_idx on public.deletion_requests(workspace_id);
create index jobs_model_idx on public.jobs(model);
create index jobs_user_idx on public.jobs(user_id);
create index jobs_version_workspace_idx on public.jobs(version_id,workspace_id);
create index memberships_user_idx on public.memberships(user_id);
create index payments_workspace_idx on public.payments(workspace_id);
create index quotes_model_idx on public.quotes(model);
create index quotes_user_idx on public.quotes(user_id);
create index quotes_workspace_idx on public.quotes(workspace_id);
create index reservations_workspace_idx on public.reservations(workspace_id);
create index uploads_character_workspace_idx on public.upload_intents(character_id,workspace_id);
create index uploads_user_idx on public.upload_intents(user_id);
create index workspaces_owner_idx on public.workspaces(owner_id);
