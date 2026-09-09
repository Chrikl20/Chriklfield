-- Run the WHOLE file as a privileged database session after all migrations.
-- No mail, payment or provider request is made. All fixtures are rolled back.
-- This checks database roles and Storage metadata, not a browser JWT or file HTTP access.
begin;
set local statement_timeout='15s';
do $$
declare
 u1 uuid:=gen_random_uuid(); u2 uuid:=gen_random_uuid();
 w1 uuid; w2 uuid; c1 uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid();
 a1 uuid:=gen_random_uuid(); object_path text;
begin
 insert into auth.users(id) values(u1),(u2);
 w1:=public.bootstrap_workspace(u1); w2:=public.bootstrap_workspace(u2);
 insert into public.characters(id,workspace_id,name)
 values(c1,w1,'Transactional RLS test A'),(c2,w2,'Transactional RLS test B');
 object_path:=w1::text||'/'||a1::text||'.jpg';
 insert into public.assets(id,workspace_id,kind,path,mime,bytes)
 values(a1,w1,'image',object_path,'image/jpeg',100);
 insert into storage.objects(bucket_id,name) values('creator-private',object_path);

 execute 'set local role authenticated';
 perform set_config('request.jwt.claim.sub',u1::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true);
 if (select count(*) from public.characters where id in(c1,c2))<>1
   or not exists(select 1 from public.characters where id=c1)
   or not exists(select 1 from storage.objects where name=object_path) then
  raise exception 'RLS_OWNER_READ_FAILED';
 end if;
 perform set_config('request.jwt.claim.sub',u2::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u2,'role','authenticated')::text,true);
 if exists(select 1 from public.characters where id=c1)
   or not exists(select 1 from public.characters where id=c2)
   or exists(select 1 from storage.objects where name=object_path) then
  raise exception 'RLS_CROSS_USER_LEAK';
 end if;
 begin
  perform public.bootstrap_workspace(u1);
  raise exception 'SERVICE_RPC_EXPOSED';
 exception when insufficient_privilege then null; end;
 begin
  execute 'truncate public.templates';
  raise exception 'AUTHENTICATED_TRUNCATE_EXPOSED';
 exception when insufficient_privilege then null; end;

 execute 'reset role';
 execute 'set local role anon';
 begin
  perform 1 from public.characters limit 1;
  raise exception 'ANON_TABLE_EXPOSED';
 exception when insufficient_privilege then null; end;
 begin
  execute 'truncate public.templates';
  raise exception 'ANON_TRUNCATE_EXPOSED';
 exception when insufficient_privilege then null; end;
 begin
  perform creator_private.is_member(w1);
  raise exception 'ANON_HELPER_EXPOSED';
 exception when insufficient_privilege then null; end;

 execute 'reset role';
 execute 'set local role service_role';
 begin
  perform public.assert_member(w1,u2);
  raise exception 'BACKEND_OWNERSHIP_CHECK_MISSING';
 exception when raise_exception then
  if sqlerrm<>'FORBIDDEN' then raise; end if;
 end;
 execute 'reset role';
end $$;
rollback;
select 'PASS: owner read, cross-user isolation, private Storage metadata, client grants and backend ownership; fixtures rolled back' as verification;
