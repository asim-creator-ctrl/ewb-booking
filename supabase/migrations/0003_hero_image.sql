-- Homepage photo, uploaded from the admin panel instead of via code changes.
alter table settings add column if not exists hero_image_url text;

-- A public storage bucket for site images. Uploads happen via the service-role
-- client (bypasses storage RLS like it does everywhere else in this app), so
-- the only policy needed here is public read access for the actual homepage.
insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do nothing;

drop policy if exists "Public read for site-assets" on storage.objects;
create policy "Public read for site-assets" on storage.objects
  for select using (bucket_id = 'site-assets');
