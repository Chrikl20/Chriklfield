-- Vercel receives metadata only. Untrusted bytes stay in private staging buckets.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('creator-intake-images','creator-intake-images',false,10485760,array['image/jpeg','image/png','image/webp']),
 ('creator-intake-videos','creator-intake-videos',false,104857600,array['video/mp4'])
on conflict(id) do nothing;

create table public.upload_intents (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
 user_id uuid not null references auth.users(id),character_id uuid,asset_id uuid not null unique default gen_random_uuid(),
 idempotency_key text not null,kind text not null check(kind in('image','video')),mime text not null,
 expected_bytes bigint not null check(expected_bytes>0),capacity_bytes bigint not null,
 bucket text not null,path text not null unique,
 state text not null default 'awaiting' check(state in('awaiting','queued','processing','ready','failed')),
 attempts int not null default 0,lease_token uuid,lease_until timestamptz,error_code text,
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '15 minutes',
 cleanup_after timestamptz not null default now()+interval '135 minutes',raw_purged_at timestamptz,
 unique(workspace_id,user_id,idempotency_key),foreign key(character_id,workspace_id) references public.characters(id,workspace_id),
 check(path=workspace_id::text||'/'||id::text||'/source'),
 check((kind='image' and bucket='creator-intake-images' and capacity_bytes=10485760 and mime in('image/jpeg','image/png','image/webp')) or
       (kind='video' and bucket='creator-intake-videos' and capacity_bytes=104857600 and mime='video/mp4')),
 check(expected_bytes<=capacity_bytes)
);
alter table public.upload_intents enable row level security;
-- Only the backend exposes selected fields. No browser table or staging-object grants.
revoke all on public.upload_intents from anon,authenticated;
grant all on public.upload_intents to service_role;
create index on public.upload_intents(state,created_at);
create index on public.upload_intents(workspace_id) where raw_purged_at is null;

create function public.upload_reserved_bytes(p_workspace uuid,p_output uuid default null)returns bigint
language sql stable security definer set search_path=public as $$
 select coalesce(sum(case when raw_purged_at is null then capacity_bytes else 0 end+
 case when state in('awaiting','queued','processing') and asset_id is distinct from p_output then capacity_bytes else 0 end),0)::bigint
 from upload_intents where workspace_id=p_workspace;
$$;

create function public.begin_upload(p_user uuid,p_workspace uuid,p_character uuid,p_mime text,p_bytes bigint,p_key text)
returns upload_intents language plpgsql security definer set search_path=public as $$
declare u upload_intents; cap bigint; k text; upload_id uuid:=gen_random_uuid();begin
 perform 1 from workspaces where id=p_workspace for update;
 perform assert_member(p_workspace,p_user);
 if length(p_key) not between 8 and 128 or p_key is null then raise exception 'INVALID_UPLOAD';end if;
 select * into u from upload_intents where workspace_id=p_workspace and user_id=p_user and idempotency_key=p_key;
 if found then
  if u.mime<>p_mime or u.expected_bytes<>p_bytes or u.character_id is distinct from p_character then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return u;
 end if;
 if p_character is not null and not exists(select 1 from characters where id=p_character and workspace_id=p_workspace and deleted_at is null)then raise exception 'CHARACTER_NOT_FOUND';end if;
 if p_mime in('image/jpeg','image/png','image/webp')then k:='image';cap:=10485760;
 elsif p_mime='video/mp4' then k:='video';cap:=104857600;
 else raise exception 'UNSUPPORTED_MEDIA';end if;
 if p_bytes is null or p_bytes<1 or p_bytes>cap then raise exception 'FILE_TOO_LARGE';end if;
 if (select count(*) from upload_intents where workspace_id=p_workspace and state in('awaiting','queued','processing'))>=3 then raise exception 'UPLOAD_CONCURRENCY_LIMIT';end if;
 -- Reserve bucket capacity, not the untrusted client byte count, plus normalized output capacity.
 if (select coalesce(sum(bytes),0) from assets where workspace_id=p_workspace and purged_at is null)+upload_reserved_bytes(p_workspace)+cap*2>
 (select storage_limit_bytes from workspaces where id=p_workspace)then raise exception 'STORAGE_LIMIT';end if;
 insert into upload_intents(id,workspace_id,user_id,character_id,idempotency_key,kind,mime,expected_bytes,capacity_bytes,bucket,path)
 values(upload_id,p_workspace,p_user,p_character,p_key,k,p_mime,p_bytes,cap,'creator-intake-'||case when k='image' then 'images' else 'videos' end,p_workspace::text||'/'||upload_id::text||'/source')returning * into u;
 return u;
end$$;

create function public.queue_upload(p_user uuid,p_workspace uuid,p_upload uuid)returns upload_intents
language plpgsql security definer set search_path=public as $$declare u upload_intents;begin
 perform 1 from workspaces where id=p_workspace for update;perform assert_member(p_workspace,p_user);
 select * into u from upload_intents where id=p_upload and user_id=p_user and workspace_id=p_workspace for update;
 if not found then raise exception 'UPLOAD_NOT_FOUND';end if;
 if u.state='awaiting' then
  if u.expires_at<now()then raise exception 'UPLOAD_EXPIRED';end if;
  update upload_intents set state='queued' where id=u.id returning * into u;
 end if;
 return u;
end$$;

create function public.claim_upload(p_upload uuid)returns upload_intents
language plpgsql security definer set search_path=public as $$declare u upload_intents;begin
 select * into u from upload_intents where id=p_upload for update;
 if not found or u.state not in('queued','processing') or u.lease_until>now()then return null;end if;
 if u.attempts>=5 or u.cleanup_after-interval '5 minutes'<now()then
  update upload_intents set state='failed',error_code='UPLOAD_PROCESSING_FAILED',lease_until=null,lease_token=null where id=u.id;
  return null;
 end if;
 update upload_intents set state='processing',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '6 minutes'
 where id=u.id returning * into u;return u;
end$$;

-- Preserve storage reservations for uploads when registering generated results too.
create or replace function public.register_asset(p_user uuid,p_workspace uuid,p_asset jsonb) returns assets
language plpgsql security definer set search_path=public as $$declare a assets;begin
 perform 1 from workspaces where id=p_workspace for update;perform assert_member(p_workspace,p_user);
 select * into a from assets where id=(p_asset->>'id')::uuid;
 if found then
  if a.workspace_id<>p_workspace or a.deleted_at is not null then raise exception 'ASSET_NOT_FOUND';end if;return a;
 end if;
 if p_asset->>'character_id' is not null and not exists(select 1 from characters where id=(p_asset->>'character_id')::uuid and workspace_id=p_workspace and deleted_at is null)then raise exception 'CHARACTER_NOT_FOUND';end if;
 if (select coalesce(sum(bytes),0) from assets where workspace_id=p_workspace and purged_at is null)+upload_reserved_bytes(p_workspace,(p_asset->>'id')::uuid)+(p_asset->>'bytes')::bigint>
 (select storage_limit_bytes from workspaces where id=p_workspace)then raise exception 'STORAGE_LIMIT';end if;
 insert into assets(id,workspace_id,kind,path,mime,bytes,width,height,duration,character_id,job_id)
 values((p_asset->>'id')::uuid,p_workspace,p_asset->>'kind',p_asset->>'path',p_asset->>'mime',(p_asset->>'bytes')::bigint,(p_asset->>'width')::int,(p_asset->>'height')::int,(p_asset->>'duration')::numeric,(p_asset->>'character_id')::uuid,(p_asset->>'job_id')::uuid)returning * into a;
 return a;
end$$;

-- Publishing the normalized asset and marking ready is one transaction, fenced by the lease.
create function public.finish_upload(p_upload uuid,p_lease uuid,p_meta jsonb)returns assets
language plpgsql security definer set search_path=public as $$declare u upload_intents;a assets;begin
 select * into u from upload_intents where id=p_upload;
 if not found then raise exception 'UPLOAD_NOT_FOUND';end if;
 perform 1 from workspaces where id=u.workspace_id for update;
 select * into u from upload_intents where id=p_upload for update;
 perform assert_member(u.workspace_id,u.user_id);
 if u.state='ready' then select * into a from assets where id=u.asset_id and deleted_at is null;return a;end if;
 if u.state<>'processing' or u.lease_token is distinct from p_lease or u.lease_until<now()then raise exception 'UPLOAD_LEASE_LOST';end if;
 if coalesce((p_meta->>'bytes')::bigint,0) not between 1 and u.capacity_bytes or (p_meta->>'mime') is distinct from (case when u.kind='image' then 'image/jpeg' else 'video/mp4' end) then raise exception 'INVALID_UPLOAD';end if;
 select * into a from register_asset(u.user_id,u.workspace_id,p_meta||jsonb_build_object('id',u.asset_id,'kind',u.kind,'character_id',u.character_id,'job_id',null,
 'path',u.workspace_id::text||'/'||u.asset_id::text||'/asset.'||case when u.kind='image' then 'jpg' else 'mp4' end));
 update upload_intents set state='ready',error_code=null,lease_token=null,lease_until=null where id=u.id;
 return a;
end$$;

create function public.retry_upload(p_upload uuid,p_lease uuid,p_code text,p_terminal boolean)returns void
language plpgsql security definer set search_path=public as $$begin
 update upload_intents set state=case when p_terminal or attempts>=5 then 'failed' else 'queued' end,
 error_code=case when p_code ~ '^[A-Z_]{1,64}$' then p_code else 'UPLOAD_PROCESSING_FAILED' end,lease_token=null,lease_until=null
 where id=p_upload and state='processing' and lease_token=p_lease;
end$$;

create function public.expire_uploads()returns void language plpgsql security definer set search_path=public as $$begin
 update upload_intents set state='failed',error_code='UPLOAD_EXPIRED' where state='awaiting' and expires_at<now();
 update upload_intents set state='failed',error_code='UPLOAD_PROCESSING_FAILED',lease_token=null,lease_until=null
 where state in('queued','processing') and (lease_until is null or lease_until<now()) and (attempts>=5 or cleanup_after-interval '5 minutes'<now());
end$$;

-- request_deletion already holds the workspace lock; this also protects direct service updates.
create function public.guard_upload_deletion()returns trigger language plpgsql security definer set search_path=public as $$
declare w uuid;begin
 if old.deleted_at is null and new.deleted_at is not null then
  if tg_table_name='workspaces' then w:=old.id;else w:=old.workspace_id;end if;
  perform 1 from workspaces where id=w for update;
  if exists(select 1 from upload_intents where workspace_id=w and
   (state in('queued','processing') or(state='awaiting' and expires_at>now())))then raise exception 'ACTIVE_UPLOADS_BLOCK_DELETION';end if;
 end if;return new;
end$$;
create trigger guard_upload_character before update of deleted_at on public.characters for each row execute function public.guard_upload_deletion();
create trigger guard_upload_workspace before update of deleted_at on public.workspaces for each row execute function public.guard_upload_deletion();

do $$declare r record;begin
 for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('upload_reserved_bytes','begin_upload','queue_upload','claim_upload','finish_upload','retry_upload','expire_uploads','guard_upload_deletion')loop
  execute format('revoke all on function %s from public,anon,authenticated',r.sig);
  execute format('grant execute on function %s to service_role',r.sig);
 end loop;
end$$;
