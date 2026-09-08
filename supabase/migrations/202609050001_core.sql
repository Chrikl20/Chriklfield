-- Chriklfield: all money/job writes happen in service-only SQL functions.
-- PostgreSQL 17 / Supabase. Monetary values are integer micro-USD; credits are integers.
create table public.workspaces (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id), name text not null default 'Mein Studio',
 balance bigint not null default 0, reserved bigint not null default 0 check(reserved>=0),
 budget_microusd bigint not null default 50000000 check(budget_microusd>0), max_parallel int not null default 3 check(max_parallel between 1 and 20),
 stripe_customer_id text unique, plan text not null default 'Free', deleted_at timestamptz, created_at timestamptz not null default now()
);
create table public.memberships (workspace_id uuid references public.workspaces(id) on delete cascade,user_id uuid references auth.users(id),role text not null check(role in ('owner','editor')),primary key(workspace_id,user_id));
create function public.is_member(w uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from memberships m join workspaces w2 on w2.id=m.workspace_id where m.workspace_id=w and m.user_id=auth.uid() and w2.deleted_at is null)$$;
create function public.assert_member(w uuid,u uuid) returns void language plpgsql security definer set search_path=public as $$begin if not exists(select 1 from memberships m join workspaces ws on ws.id=m.workspace_id where m.workspace_id=w and m.user_id=u and ws.deleted_at is null) then raise exception 'FORBIDDEN'; end if; end$$;
create table public.project_limits (id int primary key check(id=1), budget_microusd bigint not null default 200000000, max_parallel int not null default 20, user_budget_microusd bigint not null default 50000000,user_max_parallel int not null default 3, paused boolean not null default false);
insert into public.project_limits(id) values(1);
create table public.model_prices (
 model text primary key check(model in ('draft','train','image','edit','video','motion')),version text not null,unit text not null check(unit in ('image','megapixel','step','second','job')),
 unit_microusd bigint not null check(unit_microusd>=0),audio_multiplier numeric not null default 1 check(audio_multiplier>=1),resolution_multiplier numeric not null default 1 check(resolution_multiplier>=1),
 verified_at timestamptz,enabled boolean not null default false,max_parallel int not null default 5 check(max_parallel>0),budget_microusd bigint not null default 100000000 check(budget_microusd>0)
);
-- No fabricated live provider prices. Admin must review rates, units and multipliers before enabling.
insert into public.model_prices(model,version,unit,unit_microusd) values('draft','unconfigured','megapixel',0),('train','unconfigured','step',0),('image','unconfigured','megapixel',0),('edit','unconfigured','image',0),('video','unconfigured','second',0),('motion','unconfigured','second',0);
create table public.characters (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),name text not null check(length(name) between 1 and 60),identity text not null default '',body text not null default '',confirmed boolean not null default false,deleted_at timestamptz,created_at timestamptz not null default now(),unique(id,workspace_id)
);
create table public.character_versions (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),character_id uuid not null,version int not null,base_model text not null default 'krea-2',
 status text not null default 'draft' check(status in ('draft','training','ready','failed')),trigger_word text not null,weights_asset_id uuid,config_asset_id uuid,
 identity_snapshot text not null,body_snapshot text not null,parameters jsonb not null default '{}',dataset_snapshot jsonb not null default '[]',test_asset_ids uuid[] not null default '{}',created_at timestamptz not null default now(),
 foreign key(character_id,workspace_id) references public.characters(id,workspace_id),unique(character_id,version),unique(id,workspace_id)
);
create table public.quotes (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),user_id uuid not null references auth.users(id),
 model text not null references public.model_prices(model),input jsonb not null,context jsonb not null,input_hash text not null,credits bigint not null check(credits>0),estimated_microusd bigint not null check(estimated_microusd>0),pricing_version text not null,expires_at timestamptz not null,created_at timestamptz not null default now()
);
create table public.jobs (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),user_id uuid not null references auth.users(id),quote_id uuid not null unique references public.quotes(id),
 model text not null references public.model_prices(model),input jsonb not null,context jsonb not null,version_id uuid,
 status text not null default 'queued' check(status in ('queued','submitting','unknown','running','persisting','succeeded','failed')),
 credits bigint not null check(credits>0),estimated_microusd bigint not null check(estimated_microusd>0),idempotency_key text not null check(length(idempotency_key) between 8 and 128),
 error_code text,lease_token uuid,lease_until timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(workspace_id,user_id,idempotency_key),unique(id,workspace_id),foreign key(version_id,workspace_id) references public.character_versions(id,workspace_id)
);
create table public.assets (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),kind text not null check(kind in ('image','video','weights','config','dataset')),
 path text not null unique,mime text not null,bytes bigint not null check(bytes>0),width int,height int,duration numeric,character_id uuid,job_id uuid,favorite boolean not null default false,deleted_at timestamptz,purged_at timestamptz,created_at timestamptz not null default now(),
 unique(id,workspace_id),foreign key(character_id,workspace_id) references public.characters(id,workspace_id),foreign key(job_id,workspace_id) references public.jobs(id,workspace_id),check(path like workspace_id::text||'/%')
);
alter table public.character_versions add foreign key(weights_asset_id,workspace_id) references public.assets(id,workspace_id),add foreign key(config_asset_id,workspace_id) references public.assets(id,workspace_id);
create table public.character_references (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),character_id uuid not null,asset_id uuid not null,
 kind text not null check(kind in ('face','profile','body','expression')),caption text not null check(length(caption) between 1 and 1500),approved boolean not null default false,generated boolean not null default false,
 crop_mode text not null default 'contain' check(crop_mode in ('contain','cover')),crop_confirmed boolean not null default false,
 foreign key(character_id,workspace_id) references public.characters(id,workspace_id),foreign key(asset_id,workspace_id) references public.assets(id,workspace_id),unique(character_id,asset_id)
);
create table public.reservations(job_id uuid primary key references public.jobs(id),workspace_id uuid not null references public.workspaces(id),credits bigint not null,state text not null default 'held' check(state in ('held','captured','released')));
create table public.credit_ledger(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),job_id uuid references public.jobs(id),kind text not null,amount bigint not null,event_key text not null unique,created_at timestamptz not null default now());
create table public.outbox(id uuid primary key default gen_random_uuid(),job_id uuid not null unique references public.jobs(id),state text not null default 'pending' check(state in ('pending','leased','sent')),attempts int not null default 0,available_at timestamptz not null default now(),lease_until timestamptz,lease_token uuid,created_at timestamptz not null default now());
create table public.provider_attempts (
 id uuid primary key default gen_random_uuid(),job_id uuid not null unique references public.jobs(id),request_id text unique,state text not null default 'submitting' check(state in ('submitting','unknown','accepted','completed','failed')),
 estimated_microusd bigint not null,actual_microusd bigint check(actual_microusd>=0),cost_status text not null default 'unreconciled' check(cost_status in ('unreconciled','confirmed')),error_code text,created_at timestamptz not null default now()
);
create table public.webhook_inbox(provider text not null,event_id text not null,request_id text,attempt_id uuid,payload jsonb not null,body_hash text not null,processed_at timestamptz,created_at timestamptz not null default now(),primary key(provider,event_id));
create table public.payments (
 source_id text primary key,workspace_id uuid not null references public.workspaces(id),payment_intent_id text unique,charge_id text unique,
 amount_paid bigint not null check(amount_paid>0),currency text not null,credits bigint not null check(credits>0),refunded_amount bigint not null default 0,reversed_credits bigint not null default 0,created_at timestamptz not null default now()
);
create table public.refund_events(charge_id text primary key,amount_refunded bigint not null check(amount_refunded>=0),created_at timestamptz not null default now());
create table public.templates(id text primary key,title text not null,category text not null,scene text not null,outfit text not null,pose text not null,prompt text not null,format text not null,cover text not null,enabled boolean not null default true);
create table public.alerts(id uuid primary key default gen_random_uuid(),workspace_id uuid references public.workspaces(id),code text not null,details jsonb not null default '{}',event_key text not null unique,created_at timestamptz not null default now());
create table public.audit_log(id uuid primary key default gen_random_uuid(),actor_id uuid not null,action text not null,object_id text not null,details jsonb not null default '{}',created_at timestamptz not null default now());
create table public.deletion_requests(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),kind text not null check(kind in ('asset','character','workspace')),target_id uuid not null,state text not null default 'pending',created_at timestamptz not null default now(),unique(kind,target_id));
create index on public.jobs(status,updated_at);
create index on public.jobs(workspace_id,created_at desc);
create index on public.assets(workspace_id,deleted_at);
create index on public.quotes(expires_at);
create index on public.webhook_inbox(created_at) where processed_at is null;
create index on public.outbox(available_at) where state <> 'sent';

-- RLS: members read their workspace; mutations require server-side validation.
do $$declare t text; begin
 foreach t in array array['workspaces','memberships','characters','character_versions','quotes','jobs','assets','character_references','reservations','credit_ledger','deletion_requests'] loop
  execute format('alter table public.%I enable row level security',t);
  if t='workspaces' then execute 'create policy member_read on public.workspaces for select to authenticated using(public.is_member(id))';
  else execute format('create policy member_read on public.%I for select to authenticated using(public.is_member(workspace_id))',t);end if;
  execute format('grant select on public.%I to authenticated',t);
 end loop;
 foreach t in array array['project_limits','model_prices','outbox','provider_attempts','webhook_inbox','payments','refund_events','templates','alerts','audit_log'] loop execute format('alter table public.%I enable row level security',t);end loop;
end$$;
create policy visible_templates on public.templates for select to authenticated using(enabled);
create policy visible_prices on public.model_prices for select to authenticated using(true);
grant select on public.templates,public.model_prices to authenticated;

create function public.bootstrap_workspace(p_user uuid) returns uuid language plpgsql security definer set search_path=public as $$declare w uuid;begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select workspace_id into w from memberships m join workspaces ws on ws.id=m.workspace_id where m.user_id=p_user and ws.deleted_at is null order by ws.created_at limit 1;
 if w is null then insert into workspaces(owner_id) values(p_user) returning id into w; insert into memberships values(w,p_user,'owner');end if;return w;
end$$;

-- Lifetime exposure includes in-flight reservations AND every terminal provider attempt,
-- including failures whose invoices are not yet reconciled. No optimistic $0 failures.
create function public.cost_exposure(p_workspace uuid default null,p_user uuid default null,p_model text default null) returns bigint language sql stable security definer set search_path=public as $$
 select coalesce(sum(case when j.status not in ('succeeded','failed') then j.estimated_microusd else coalesce(a.actual_microusd,a.estimated_microusd,0) end),0)::bigint
 from jobs j left join provider_attempts a on a.job_id=j.id where(p_workspace is null or j.workspace_id=p_workspace)and(p_user is null or j.user_id=p_user)and(p_model is null or j.model=p_model)
$$;
create function public.enqueue_job(p_user uuid,p_workspace uuid,p_quote uuid,p_key text) returns uuid language plpgsql security definer set search_path=public as $$
declare q quotes;j jobs;w workspaces;pl project_limits;mp model_prices;c characters;v uuid;n int;begin
 perform assert_member(p_workspace,p_user);
 -- One consistent lock order serializes overlapping budget checks across workspaces.
 select * into pl from project_limits where id=1 for update;
 select * into w from workspaces where id=p_workspace for update;
 select * into j from jobs where workspace_id=p_workspace and user_id=p_user and idempotency_key=p_key;
 if found then if j.quote_id<>p_quote then raise exception 'IDEMPOTENCY_CONFLICT';end if;return j.id;end if;
 select * into q from quotes where id=p_quote and workspace_id=p_workspace and user_id=p_user for update;
 if not found then raise exception 'QUOTE_NOT_FOUND';end if;
 select * into j from jobs where quote_id=p_quote;
 if found then return j.id;end if;
 if q.expires_at<now() then raise exception 'QUOTE_EXPIRED';end if;
 select * into mp from model_prices where model=q.model;
 if pl.paused or not mp.enabled then raise exception 'MODEL_DISABLED';end if;
 if mp.verified_at is null or mp.verified_at<now()-interval '7 days' or q.pricing_version not like '%:'||mp.version then raise exception 'PRICE_REVIEW_REQUIRED';end if;
 if w.balance-w.reserved<q.credits then raise exception 'INSUFFICIENT_CREDITS';end if;
 if cost_exposure()+q.estimated_microusd>pl.budget_microusd or cost_exposure(p_workspace)+q.estimated_microusd>w.budget_microusd or cost_exposure(null,p_user)+q.estimated_microusd>pl.user_budget_microusd or cost_exposure(null,null,q.model)+q.estimated_microusd>mp.budget_microusd then raise exception 'SPEND_LIMIT';end if;
 if (select count(*) from jobs where status not in('succeeded','failed'))>=pl.max_parallel or (select count(*) from jobs where status not in('succeeded','failed') and workspace_id=p_workspace)>=w.max_parallel or(select count(*) from jobs where status not in('succeeded','failed')and user_id=p_user)>=pl.user_max_parallel or(select count(*) from jobs where status not in('succeeded','failed')and model=q.model)>=mp.max_parallel then raise exception 'CONCURRENCY_LIMIT';end if;
 if q.input->>'characterId' is not null then
  select * into c from characters where id=(q.input->>'characterId')::uuid and workspace_id=p_workspace and deleted_at is null for update;
  if not found then raise exception 'CHARACTER_NOT_FOUND';end if;
 end if;
 -- Quotes freeze data; deletion is rechecked transactionally immediately before enqueue.
 if exists(select 1 from jsonb_array_elements(q.context->'assets') x left join assets a on a.id=(x->>'id')::uuid and a.workspace_id=p_workspace where a.id is null or a.deleted_at is not null) then raise exception 'ASSET_NOT_FOUND';end if;
 if q.model='train' then
  if not c.confirmed then raise exception 'IDENTITY_NOT_CONFIRMED';end if;
  if jsonb_array_length(q.context->'references') not between 8 and 80 then raise exception 'NEED_EIGHT_APPROVED_REFERENCES';end if;
  if exists(select 1 from jsonb_array_elements(q.context->'references') x left join character_references r on r.id=(x->>'id')::uuid where r.id is null or not r.approved or not r.crop_confirmed or r.caption<>x->>'caption' or r.crop_mode<>x->>'crop_mode' or r.kind<>x->>'kind' or r.workspace_id<>p_workspace or r.character_id<>c.id)then raise exception 'REFERENCES_CHANGED';end if;
  select coalesce(max(version),0)+1 into n from character_versions where character_id=c.id;
  insert into character_versions(workspace_id,character_id,version,status,trigger_word,identity_snapshot,body_snapshot,parameters,dataset_snapshot)
  values(p_workspace,c.id,n,'training','chr'||replace(c.id::text,'-',''),q.context->>'identity',q.context->>'body',q.input,q.context->'references') returning id into v;
 else v=(q.input->>'versionId')::uuid;end if;
 insert into jobs(workspace_id,user_id,quote_id,model,input,context,version_id,credits,estimated_microusd,idempotency_key)
 values(p_workspace,p_user,p_quote,q.model,q.input,q.context,v,q.credits,q.estimated_microusd,p_key) returning * into j;
 update workspaces set reserved=reserved+q.credits where id=p_workspace;
 insert into reservations(job_id,workspace_id,credits) values(j.id,p_workspace,q.credits);
 insert into credit_ledger(workspace_id,job_id,kind,amount,event_key) values(p_workspace,j.id,'reserve',-q.credits,'reserve:'||j.id);
 insert into outbox(job_id) values(j.id);
 if cost_exposure(p_workspace)>w.budget_microusd*0.8 then insert into alerts(workspace_id,code,event_key)values(p_workspace,'BUDGET_80_PERCENT','budget:'||p_workspace)on conflict do nothing;end if;
 return j.id;
end$$;

create function public.claim_outbox(p_limit int default 10) returns setof outbox language plpgsql security definer set search_path=public as $$begin
 return query update outbox set state='leased',lease_until=now()+interval '2 minutes',lease_token=gen_random_uuid(),attempts=attempts+1
 where id in(select id from outbox where(state='pending' or(state='leased' and lease_until<now()))and available_at<=now()and attempts<100 order by created_at for update skip locked limit least(p_limit,20))returning *;
end$$;
create function public.claim_job(p_job uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path=public as $$declare j jobs;a provider_attempts;begin
 select * into j from jobs where id=p_job for update;if not found then raise exception 'JOB_NOT_FOUND';end if;
 perform assert_member(j.workspace_id,j.user_id);
 if j.status in ('succeeded','failed') then return jsonb_build_object('action','done');end if;
 if j.lease_until>now() then return jsonb_build_object('action','busy');end if;
 update jobs set lease_token=p_token,lease_until=now()+interval '10 minutes',updated_at=now() where id=p_job;
 select * into a from provider_attempts where job_id=p_job;
 if found then
  if a.request_id is null then update jobs set status='unknown' where id=p_job;return jsonb_build_object('action','unknown','job',to_jsonb(j),'attempt',to_jsonb(a));end if;
  return jsonb_build_object('action','reconcile','job',to_jsonb(j),'attempt',to_jsonb(a));
 end if;
 return jsonb_build_object('action','prepare','job',to_jsonb(j));
end$$;
create function public.begin_attempt(p_job uuid,p_token uuid) returns uuid language plpgsql security definer set search_path=public as $$declare j jobs;a uuid;begin
 select * into j from jobs where id=p_job for update;perform assert_member(j.workspace_id,j.user_id);
 if j.lease_token is distinct from p_token or j.lease_until<now() or j.status<>'queued' then raise exception 'LEASE_LOST';end if;
 insert into provider_attempts(job_id,estimated_microusd)values(j.id,j.estimated_microusd)returning id into a;
 update jobs set status='submitting',updated_at=now()where id=j.id;return a;
end$$;
create function public.accept_attempt(p_attempt uuid,p_request text) returns void language plpgsql security definer set search_path=public as $$declare a provider_attempts;begin
 select * into a from provider_attempts where id=p_attempt;
 perform 1 from jobs where id=a.job_id for update;
 select * into a from provider_attempts where id=p_attempt for update;
 if not found then raise exception 'ATTEMPT_NOT_FOUND';end if;
 if a.request_id is not null and a.request_id<>p_request then raise exception 'REQUEST_ID_CONFLICT';end if;
 update provider_attempts set request_id=p_request,state=case when state in ('completed','failed')then state else 'accepted'end where id=p_attempt;
 update jobs set status='running',updated_at=now() where id=a.job_id and status in('queued','submitting','unknown');
end$$;
create function public.settle_job(p_job uuid,p_success boolean,p_error text default null) returns boolean language plpgsql security definer set search_path=public as $$declare j jobs;r reservations;begin
 -- Settlement has the same budget/workspace/job lock order as reservation.
 perform 1 from project_limits where id=1 for update;
 select * into j from jobs where id=p_job;if not found then raise exception 'JOB_NOT_FOUND';end if;
 perform 1 from workspaces where id=j.workspace_id for update;
 select * into j from jobs where id=p_job for update;
 select * into r from reservations where job_id=p_job for update;
 if r.state<>'held' then return false;end if;
 if p_success then
  if not exists(select 1 from provider_attempts where job_id=p_job and state='completed')then raise exception 'PROVIDER_NOT_TERMINAL';end if;
  if j.model='train' then
   if not exists(select 1 from character_versions v join assets a on a.id=v.weights_asset_id and a.kind='weights' and a.job_id=p_job and a.deleted_at is null join assets c on c.id=v.config_asset_id and c.kind='config' and c.job_id=p_job and c.deleted_at is null where v.id=j.version_id)then raise exception 'RESULTS_NOT_PERSISTED';end if;
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

-- Events and the paid resource ID are independently unique, covering different Stripe
-- events for the same payment and out-of-order refund/payment deliveries.
create function public.apply_payment(p_event text,p_source text,p_workspace uuid,p_intent text,p_charge text,p_amount bigint,p_currency text,p_credits bigint) returns boolean language plpgsql security definer set search_path=public as $$declare rf bigint;rev bigint;begin
 perform pg_advisory_xact_lock(hashtextextended(p_charge,1));
 perform 1 from workspaces where id=p_workspace for update;if not found then raise exception 'WORKSPACE_NOT_FOUND';end if;
 if exists(select 1 from payments where source_id=p_source or(p_intent is not null and payment_intent_id=p_intent)or(p_charge is not null and charge_id=p_charge))then return false;end if;
 select coalesce(amount_refunded,0) into rf from refund_events where charge_id=p_charge;rf=least(coalesce(rf,0),p_amount);rev=ceil(p_credits::numeric*rf/p_amount)::bigint;
 insert into payments values(p_source,p_workspace,p_intent,p_charge,p_amount,p_currency,p_credits,rf,rev,now());
 update workspaces set balance=balance+p_credits-rev where id=p_workspace;
 insert into credit_ledger(workspace_id,kind,amount,event_key)values(p_workspace,'payment',p_credits-rev,'payment:'||p_source);
 update webhook_inbox set processed_at=now()where provider='stripe'and event_id=p_event;return true;
end$$;
create function public.apply_refund(p_event text,p_charge text,p_cumulative bigint) returns boolean language plpgsql security definer set search_path=public as $$declare p payments;r bigint;delta bigint;begin
 -- Serialize refund-before-payment too, including a payment not yet present.
 perform pg_advisory_xact_lock(hashtextextended(p_charge,1));
 insert into refund_events(charge_id,amount_refunded)values(p_charge,p_cumulative)on conflict(charge_id)do update set amount_refunded=greatest(refund_events.amount_refunded,excluded.amount_refunded);
 select * into p from payments where charge_id=p_charge;
 if not found then return false;end if;
 perform 1 from workspaces where id=p.workspace_id for update;
 select * into p from payments where charge_id=p_charge for update;
 r=ceil(p.credits::numeric*least(p.amount_paid,p_cumulative)/p.amount_paid)::bigint;delta=greatest(0,r-p.reversed_credits);
 update payments set refunded_amount=greatest(refunded_amount,least(amount_paid,p_cumulative)),reversed_credits=greatest(reversed_credits,r)where source_id=p.source_id;
 -- Negative balance is intentional debt if already spent; future reservations are blocked.
 update workspaces set balance=balance-delta where id=p.workspace_id;
 if delta>0 then insert into credit_ledger(workspace_id,kind,amount,event_key)values(p.workspace_id,'refund',-delta,'refund:'||p_charge||':'||r)on conflict do nothing;end if;
 update webhook_inbox set processed_at=now()where provider='stripe'and event_id=p_event;return delta>0;
end$$;
create function public.request_deletion(p_user uuid,p_workspace uuid,p_kind text,p_target uuid) returns uuid language plpgsql security definer set search_path=public as $$declare d uuid;begin
 perform assert_member(p_workspace,p_user);
 perform 1 from project_limits where id=1 for update;
 perform 1 from workspaces where id=p_workspace for update;
 if exists(select 1 from jobs where workspace_id=p_workspace and status not in('succeeded','failed'))then raise exception 'ACTIVE_JOBS_BLOCK_DELETION';end if;
 if p_kind='asset' then
  if exists(select 1 from character_versions where weights_asset_id=p_target or config_asset_id=p_target)then raise exception 'DELETE_CHARACTER_FOR_WEIGHTS';end if;
  update assets set deleted_at=now()where id=p_target and workspace_id=p_workspace;
  if not found then raise exception 'ASSET_NOT_FOUND';end if;
  delete from character_references where asset_id=p_target and workspace_id=p_workspace;
 elsif p_kind='character' then
  update characters set deleted_at=now()where id=p_target and workspace_id=p_workspace;
  if not found then raise exception 'CHARACTER_NOT_FOUND';end if;
  update assets set deleted_at=now()where workspace_id=p_workspace and character_id=p_target;
  delete from character_references where character_id=p_target and workspace_id=p_workspace;
 elsif p_kind='workspace' then
  if not exists(select 1 from workspaces where id=p_target and id=p_workspace and owner_id=p_user)then raise exception 'FORBIDDEN';end if;
  update assets set deleted_at=now()where workspace_id=p_workspace;
  update characters set deleted_at=now()where workspace_id=p_workspace;
  update workspaces set deleted_at=now()where id=p_workspace;
 else raise exception 'INVALID_DELETION';end if;
 insert into deletion_requests(workspace_id,kind,target_id)values(p_workspace,p_kind,p_target)on conflict(kind,target_id)do update set state=deletion_requests.state returning id into d;return d;
end$$;

-- Supabase grants new functions to PUBLIC by default; explicitly revoke all sensitive RPCs.
do $$declare r record;begin
 for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname in('assert_member','bootstrap_workspace','cost_exposure','enqueue_job','claim_outbox','claim_job','begin_attempt','accept_attempt','settle_job','apply_payment','apply_refund','request_deletion')loop
  execute format('revoke all on function %s from public, anon, authenticated',r.sig);execute format('grant execute on function %s to service_role',r.sig);
 end loop;
end$$;
grant all on all tables in schema public to service_role;
grant usage on schema public to service_role,authenticated;
