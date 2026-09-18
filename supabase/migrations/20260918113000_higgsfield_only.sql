-- Switch character identity training from provider-specific LoRA artifacts to Higgsfield Soul IDs.
alter table public.character_versions
  add column if not exists provider_reference_id text;

alter table public.character_versions
  alter column base_model set default 'higgsfield-soul';

-- Force a fresh manual price review for the new provider before paid generation can start.
update public.model_prices
set version = 'higgsfield-unconfigured',
    unit = case
      when model in ('draft','image','edit') then 'image'
      when model = 'train' then 'job'
      else 'second'
    end,
    unit_microusd = 0,
    verified_at = null,
    enabled = false;

create or replace function public.settle_job(p_job uuid,p_success boolean,p_error text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare j jobs;r reservations;
begin
 perform 1 from project_limits where id=1 for update;
 select * into j from jobs where id=p_job;if not found then raise exception 'JOB_NOT_FOUND';end if;
 perform 1 from workspaces where id=j.workspace_id for update;
 select * into j from jobs where id=p_job for update;
 select * into r from reservations where job_id=p_job for update;
 if r.state<>'held' then return false;end if;
 if p_success then
  if not exists(select 1 from provider_attempts where job_id=p_job and state='completed')then raise exception 'PROVIDER_NOT_TERMINAL';end if;
  if j.model='train' then
   if not exists(select 1 from character_versions v where v.id=j.version_id and v.provider_reference_id is not null and length(v.provider_reference_id)>0)then raise exception 'RESULTS_NOT_PERSISTED';end if;
  elsif j.model in('video','motion') then
   if not exists(select 1 from assets where job_id=p_job and kind='video' and deleted_at is null)then raise exception 'RESULTS_NOT_PERSISTED';end if;
  elsif (select count(*) from assets where job_id=p_job and kind='image' and deleted_at is null)<coalesce((j.input->>'count')::int,1)then raise exception 'RESULTS_NOT_PERSISTED';end if;
 end if;
 if not p_success and exists(select 1 from provider_attempts where job_id=p_job and state in('submitting','unknown','accepted'))then raise exception 'PROVIDER_NOT_TERMINAL';end if;
 update workspaces set reserved=reserved-r.credits,balance=balance-case when p_success then r.credits else 0 end where id=j.workspace_id;
 update reservations set state=case when p_success then 'captured' else 'released'end where job_id=p_job;
 update jobs set status=case when p_success then 'succeeded' else 'failed'end,error_code=p_error,lease_until=null,updated_at=now()where id=p_job;
 insert into credit_ledger(workspace_id,job_id,kind,amount,event_key)values(j.workspace_id,j.id,case when p_success then 'capture'else 'release'end,case when p_success then -r.credits else r.credits end,'settle:'||p_job);
 if j.model='train' then update character_versions set status=case when p_success then 'ready'else 'failed'end where id=j.version_id;end if;
 return true;
end$$;
