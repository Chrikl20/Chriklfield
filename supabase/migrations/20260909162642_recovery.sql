alter table public.workspaces add column storage_limit_bytes bigint not null default 2147483648 check(storage_limit_bytes>0);
-- Serialize asset registration with deletion and never restore a tombstone on retry.
create function public.register_asset(p_user uuid,p_workspace uuid,p_asset jsonb) returns assets
language plpgsql security definer set search_path=public as $$declare a assets;begin
 perform 1 from workspaces where id=p_workspace for update;
 perform assert_member(p_workspace,p_user);
 select * into a from assets where id=(p_asset->>'id')::uuid;
 if found then
  if a.workspace_id<>p_workspace or a.deleted_at is not null then raise exception 'ASSET_NOT_FOUND';end if;
  return a;
 end if;
 if p_asset->>'character_id' is not null and not exists(select 1 from characters where id=(p_asset->>'character_id')::uuid and workspace_id=p_workspace and deleted_at is null)then raise exception 'CHARACTER_NOT_FOUND';end if;
 if (select coalesce(sum(bytes),0) from assets where workspace_id=p_workspace and purged_at is null)+(p_asset->>'bytes')::bigint>(select storage_limit_bytes from workspaces where id=p_workspace)then raise exception 'STORAGE_LIMIT';end if;
 insert into assets(id,workspace_id,kind,path,mime,bytes,width,height,duration,character_id,job_id)
 values((p_asset->>'id')::uuid,p_workspace,p_asset->>'kind',p_asset->>'path',p_asset->>'mime',(p_asset->>'bytes')::bigint,(p_asset->>'width')::int,(p_asset->>'height')::int,(p_asset->>'duration')::numeric,(p_asset->>'character_id')::uuid,(p_asset->>'job_id')::uuid)returning * into a;
 return a;
end$$;

create function public.add_test_image(p_user uuid,p_workspace uuid,p_version uuid,p_asset uuid)returns void
language plpgsql security definer set search_path=public as $$begin
 perform 1 from workspaces where id=p_workspace for update;
 perform assert_member(p_workspace,p_user);
 if not exists(select 1 from assets a join character_versions v on v.character_id=a.character_id and v.workspace_id=a.workspace_id where a.id=p_asset and a.workspace_id=p_workspace and a.deleted_at is null and a.kind='image' and v.id=p_version)then raise exception 'TEST_IMAGE_MISMATCH';end if;
 update character_versions set test_asset_ids=array(select distinct unnest(test_asset_ids||p_asset))where id=p_version and workspace_id=p_workspace;
end$$;

-- Human attestation is required. A timeout or a 404 alone is NOT sufficient evidence.
create function public.resolve_unaccepted(p_actor uuid,p_attempt uuid,p_evidence text)returns void
language plpgsql security definer set search_path=public as $$declare a provider_attempts;j jobs;begin
 if length(trim(p_evidence))<10 or length(p_evidence)>300 then raise exception 'PROVIDER_EVIDENCE_REQUIRED';end if;
 perform 1 from project_limits where id=1 for update;
 select * into a from provider_attempts where id=p_attempt;
 select * into j from jobs where id=a.job_id;
 perform 1 from workspaces where id=j.workspace_id for update;
 perform 1 from jobs where id=j.id for update;
 select * into a from provider_attempts where id=p_attempt for update;
 if a.id is null or a.request_id is not null or a.state not in('unknown','submitting') or j.lease_until>now()then raise exception 'ATTEMPT_NOT_UNKNOWN';end if;
 update provider_attempts set state='failed',actual_microusd=0,cost_status='confirmed',error_code='PROVIDER_CONFIRMED_UNACCEPTED' where id=a.id;
 perform settle_job(j.id,false,'PROVIDER_CONFIRMED_UNACCEPTED');
 insert into audit_log(actor_id,action,object_id,details)values(p_actor,'provider_confirmed_unaccepted',a.id,jsonb_build_object('evidence',p_evidence));
end$$;
revoke all on function public.register_asset(uuid,uuid,jsonb),public.add_test_image(uuid,uuid,uuid,uuid),public.resolve_unaccepted(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.register_asset(uuid,uuid,jsonb),public.add_test_image(uuid,uuid,uuid,uuid),public.resolve_unaccepted(uuid,uuid,text) to service_role;
alter table public.webhook_inbox add column recovery_attempts int not null default 0;

create table public.request_counters(user_id uuid references auth.users(id),scope text,bucket bigint,used int not null,primary key(user_id,scope,bucket));
alter table public.request_counters enable row level security;
grant all on public.request_counters to service_role;
create function public.consume_rate(p_user uuid,p_scope text,p_limit int)returns void language plpgsql security definer set search_path=public as $$declare n int;begin
 insert into request_counters values(p_user,p_scope,floor(extract(epoch from now())/60),1)on conflict(user_id,scope,bucket)do update set used=request_counters.used+1 returning used into n;
 if n>p_limit then raise exception 'RATE_LIMIT';end if;
end$$;
create function public.cleanup_ephemeral()returns void language plpgsql security definer set search_path=public as $$begin
 delete from request_counters where bucket<floor(extract(epoch from now())/60)-60;
 delete from quotes q where q.expires_at<now()-interval '1 day' and not exists(select 1 from jobs j where j.quote_id=q.id);
end$$;
revoke all on function public.consume_rate(uuid,text,int),public.cleanup_ephemeral() from public,anon,authenticated;
grant execute on function public.consume_rate(uuid,text,int),public.cleanup_ephemeral() to service_role;
