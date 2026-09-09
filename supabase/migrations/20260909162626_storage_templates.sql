insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('creator-private','creator-private',false,1073741824,array['image/jpeg','image/png','image/webp','video/mp4','application/zip','application/json','application/octet-stream'])on conflict(id)do nothing;
-- Browser writes are deliberately absent. Uploads are validated and stored by the backend.
create policy member_private_read on storage.objects for select to authenticated using(bucket_id='creator-private' and exists(select 1 from public.assets a where a.path=name and a.deleted_at is null and public.is_member(a.workspace_id)));
insert into public.templates values
 ('coastal','Coastal diary','Lifestyle','A quiet coast, late afternoon daylight','Linen shirt, relaxed trousers','Walking, candid side view','Casual phone photograph, natural light, everyday framing, soft detail.','4:5','/demo/coast.jpg',true),
 ('city','After hours','Editorial','Modern city street at blue hour','Dark tailored jacket','Looking over one shoulder','Candid street photo, subtle city reflections, believable skin, no studio lighting.','4:5','/demo/city.jpg',true),
 ('studio','Soft studio','Portrait','Bright creative studio, window light','Simple white t-shirt','Relaxed posture, gentle smile','Everyday unedited phone photograph, clean light, natural expression.','1:1','/demo/interior.jpg',true);
