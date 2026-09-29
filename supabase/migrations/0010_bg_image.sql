-- App-wide background, uploaded from the admin panel like the homepage hero
-- photo. Null means: use the built-in gradient (no photo needed). Reuses the
-- existing public "site-assets" storage bucket — no new bucket/policy needed.
alter table settings add column if not exists bg_image_url text;
