-- Complete provider migration: Higgsfield Soul ID is the only character identity backend.

alter table public.character_versions
  add column if not exists provider_reference_id text;

alter table public.character_versions
  alter column base_model set default 'higgsfield-soul';

update public.character_versions
set base_model = 'higgsfield-soul',
    status = case
      when status = 'ready' and provider_reference_id is null then 'failed'
      else status
    end
where base_model <> 'higgsfield-soul'
   or (status = 'ready' and provider_reference_id is null);

create unique index if not exists character_versions_provider_reference_id_key
  on public.character_versions(provider_reference_id)
  where provider_reference_id is not null;

-- Force a fresh manual Higgsfield price review before paid generation is enabled.
update public.model_prices
set version = 'higgsfield-unconfigured',
    unit = case
      when model in ('draft','image','edit') then 'image'
      when model = 'train' then 'job'
      else 'second'
    end,
    unit_microusd = 0,
    audio_multiplier = 1,
    resolution_multiplier = 1,
    verified_at = null,
    enabled = false;

alter table public.model_prices
  drop constraint if exists model_prices_unit_check;
alter table public.model_prices
  add constraint model_prices_unit_check check(unit in ('image','second','job'));

create or replace function public.enqueue_job(
  p_user uuid,
  p_workspace uuid,
  p_quote uuid,
  p_key text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  q quotes;
  j jobs;
  w workspaces;
  pl project_limits;
  mp model_prices;
  c characters;
  v uuid;
  n int;
begin
  perform assert_member(p_workspace,p_user);
  select * into pl from project_limits where id=1 for update;
  select * into w from workspaces where id=p_workspace for update;

  select * into j
  from jobs
  where workspace_id=p_workspace and user_id=p_user and idempotency_key=p_key;
  if found then
    if j.quote_id<>p_quote then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return j.id;
  end if;

  select * into q
  from quotes
  where id=p_quote and workspace_id=p_workspace and user_id=p_user
  for update;
  if not found then raise exception 'QUOTE_NOT_FOUND'; end if;

  select * into j from jobs where quote_id=p_quote;
  if found then return j.id; end if;

  if q.expires_at<now() then raise exception 'QUOTE_EXPIRED'; end if;

  select * into mp from model_prices where model=q.model;
  if pl.paused or not mp.enabled then raise exception 'MODEL_DISABLED'; end if;
  if mp.verified_at is null
     or mp.verified_at<now()-interval '7 days'
     or q.pricing_version not like '%:'||mp.version
  then
    raise exception 'PRICE_REVIEW_REQUIRED';
  end if;

  if w.balance-w.reserved<q.credits then raise exception 'INSUFFICIENT_CREDITS'; end if;

  if cost_exposure()+q.estimated_microusd>pl.budget_microusd
     or cost_exposure(p_workspace)+q.estimated_microusd>w.budget_microusd
     or cost_exposure(null,p_user)+q.estimated_microusd>pl.user_budget_microusd
     or cost_exposure(null,null,q.model)+q.estimated_microusd>mp.budget_microusd
  then
    raise exception 'SPEND_LIMIT';
  end if;

  if (select count(*) from jobs where status not in('succeeded','failed'))>=pl.max_parallel
     or (select count(*) from jobs where status not in('succeeded','failed') and workspace_id=p_workspace)>=w.max_parallel
     or (select count(*) from jobs where status not in('succeeded','failed') and user_id=p_user)>=pl.user_max_parallel
     or (select count(*) from jobs where status not in('succeeded','failed') and model=q.model)>=mp.max_parallel
  then
    raise exception 'CONCURRENCY_LIMIT';
  end if;

  if q.input->>'characterId' is not null then
    select * into c
    from characters
    where id=(q.input->>'characterId')::uuid
      and workspace_id=p_workspace
      and deleted_at is null
    for update;
    if not found then raise exception 'CHARACTER_NOT_FOUND'; end if;
  end if;

  if exists(
    select 1
    from jsonb_array_elements(q.context->'assets') x
    left join assets a
      on a.id=(x->>'id')::uuid
     and a.workspace_id=p_workspace
    where a.id is null or a.deleted_at is not null
  ) then
    raise exception 'ASSET_NOT_FOUND';
  end if;

  if q.model='train' then
    if not c.confirmed then raise exception 'IDENTITY_NOT_CONFIRMED'; end if;
    if jsonb_array_length(q.context->'references') not between 20 and 80 then
      raise exception 'NEED_TWENTY_APPROVED_REFERENCES';
    end if;

    if exists(
      select 1
      from jsonb_array_elements(q.context->'references') x
      left join character_references r on r.id=(x->>'id')::uuid
      where r.id is null
         or not r.approved
         or not r.crop_confirmed
         or r.caption<>x->>'caption'
         or r.crop_mode<>x->>'crop_mode'
         or r.kind<>x->>'kind'
         or r.workspace_id<>p_workspace
         or r.character_id<>c.id
    ) then
      raise exception 'REFERENCES_CHANGED';
    end if;

    select coalesce(max(version),0)+1
      into n
      from character_versions
      where character_id=c.id;

    insert into character_versions(
      workspace_id,
      character_id,
      version,
      base_model,
      status,
      provider_reference_id,
      identity_snapshot,
      body_snapshot,
      parameters,
      dataset_snapshot
    )
    values(
      p_workspace,
      c.id,
      n,
      'higgsfield-soul',
      'training',
      null,
      q.context->>'identity',
      q.context->>'body',
      q.input,
      q.context->'references'
    )
    returning id into v;
  else
    v=(q.input->>'versionId')::uuid;
  end if;

  insert into jobs(
    workspace_id,user_id,quote_id,model,input,context,version_id,
    credits,estimated_microusd,idempotency_key
  )
  values(
    p_workspace,p_user,p_quote,q.model,q.input,q.context,v,
    q.credits,q.estimated_microusd,p_key
  )
  returning * into j;

  update workspaces set reserved=reserved+q.credits where id=p_workspace;
  insert into reservations(job_id,workspace_id,credits) values(j.id,p_workspace,q.credits);
  insert into credit_ledger(workspace_id,job_id,kind,amount,event_key)
    values(p_workspace,j.id,'reserve',-q.credits,'reserve:'||j.id);
  insert into outbox(job_id) values(j.id);

  if cost_exposure(p_workspace)>w.budget_microusd*0.8 then
    insert into alerts(workspace_id,code,event_key)
      values(p_workspace,'BUDGET_80_PERCENT','budget:'||p_workspace)
      on conflict do nothing;
  end if;

  return j.id;
end
$$;

create or replace function public.settle_job(
  p_job uuid,
  p_success boolean,
  p_error text default null
) returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  j jobs;
  r reservations;
begin
  perform 1 from project_limits where id=1 for update;
  select * into j from jobs where id=p_job;
  if not found then raise exception 'JOB_NOT_FOUND'; end if;

  perform 1 from workspaces where id=j.workspace_id for update;
  select * into j from jobs where id=p_job for update;
  select * into r from reservations where job_id=p_job for update;

  if r.state<>'held' then return false; end if;

  if p_success then
    if not exists(
      select 1 from provider_attempts where job_id=p_job and state='completed'
    ) then
      raise exception 'PROVIDER_NOT_TERMINAL';
    end if;

    if j.model='train' then
      if not exists(
        select 1
        from character_versions v
        where v.id=j.version_id
          and v.provider_reference_id is not null
          and length(v.provider_reference_id)>0
      ) then
        raise exception 'RESULTS_NOT_PERSISTED';
      end if;
    elsif j.model in('video','motion') then
      if not exists(
        select 1 from assets
        where job_id=p_job and kind='video' and deleted_at is null
      ) then
        raise exception 'RESULTS_NOT_PERSISTED';
      end if;
    elsif (
      select count(*)
      from assets
      where job_id=p_job and kind='image' and deleted_at is null
    ) < coalesce((j.input->>'count')::int,1) then
      raise exception 'RESULTS_NOT_PERSISTED';
    end if;
  end if;

  if not p_success and exists(
    select 1
    from provider_attempts
    where job_id=p_job and state in('submitting','unknown','accepted')
  ) then
    raise exception 'PROVIDER_NOT_TERMINAL';
  end if;

  update workspaces
  set reserved=reserved-r.credits,
      balance=balance-case when p_success then r.credits else 0 end
  where id=j.workspace_id;

  update reservations
  set state=case when p_success then 'captured' else 'released' end
  where job_id=p_job;

  update jobs
  set status=case when p_success then 'succeeded' else 'failed' end,
      error_code=p_error,
      lease_until=null,
      updated_at=now()
  where id=p_job;

  insert into credit_ledger(workspace_id,job_id,kind,amount,event_key)
  values(
    j.workspace_id,
    j.id,
    case when p_success then 'capture' else 'release' end,
    case when p_success then -r.credits else r.credits end,
    'settle:'||p_job
  );

  if j.model='train' then
    update character_versions
    set status=case when p_success then 'ready' else 'failed' end
    where id=j.version_id;
  end if;

  return true;
end
$$;

create or replace function public.request_deletion(
  p_user uuid,
  p_workspace uuid,
  p_kind text,
  p_target uuid
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  d uuid;
begin
  perform assert_member(p_workspace,p_user);
  perform 1 from project_limits where id=1 for update;
  perform 1 from workspaces where id=p_workspace for update;

  if exists(
    select 1 from jobs
    where workspace_id=p_workspace and status not in('succeeded','failed')
  ) then
    raise exception 'ACTIVE_JOBS_BLOCK_DELETION';
  end if;

  if p_kind='asset' then
    update assets
    set deleted_at=now()
    where id=p_target and workspace_id=p_workspace;
    if not found then raise exception 'ASSET_NOT_FOUND'; end if;
    delete from character_references where asset_id=p_target and workspace_id=p_workspace;
  elsif p_kind='character' then
    update characters
    set deleted_at=now()
    where id=p_target and workspace_id=p_workspace;
    if not found then raise exception 'CHARACTER_NOT_FOUND'; end if;
    update assets
    set deleted_at=now()
    where workspace_id=p_workspace and character_id=p_target;
    delete from character_references
    where character_id=p_target and workspace_id=p_workspace;
  elsif p_kind='workspace' then
    if not exists(
      select 1 from workspaces
      where id=p_target and id=p_workspace and owner_id=p_user
    ) then
      raise exception 'FORBIDDEN';
    end if;
    update assets set deleted_at=now() where workspace_id=p_workspace;
    update characters set deleted_at=now() where workspace_id=p_workspace;
    update workspaces set deleted_at=now() where id=p_workspace;
  else
    raise exception 'INVALID_DELETION';
  end if;

  insert into deletion_requests(workspace_id,kind,target_id)
  values(p_workspace,p_kind,p_target)
  on conflict(kind,target_id)
  do update set state=deletion_requests.state
  returning id into d;

  return d;
end
$$;

drop index if exists public.versions_config_workspace_idx;
drop index if exists public.versions_weights_workspace_idx;

alter table public.character_versions
  drop constraint if exists character_versions_weights_asset_id_workspace_id_fkey,
  drop constraint if exists character_versions_config_asset_id_workspace_id_fkey,
  drop column if exists trigger_word,
  drop column if exists weights_asset_id,
  drop column if exists config_asset_id;

do $$
begin
  if exists(select 1 from public.assets where kind not in ('image','video')) then
    raise exception 'LEGACY_ASSETS_PRESENT';
  end if;
end
$$;

alter table public.assets drop constraint if exists assets_kind_check;
alter table public.assets
  add constraint assets_kind_check check(kind in ('image','video'));
