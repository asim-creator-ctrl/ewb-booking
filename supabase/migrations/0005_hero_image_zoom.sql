-- Full crop control: horizontal position and zoom, alongside the vertical
-- position already added. Stored as plain integers so the same values drive
-- both the admin preview and the live homepage identically.
alter table settings add column if not exists hero_image_position_x smallint not null default 50
  check (hero_image_position_x between 0 and 100);
alter table settings add column if not exists hero_image_zoom smallint not null default 100
  check (hero_image_zoom between 100 and 300);
