-- Lets the admin choose which vertical band of the hero photo shows, since
-- the homepage frame is short and wide while most portraits are tall.
alter table settings add column if not exists hero_image_position_y smallint not null default 50
  check (hero_image_position_y between 0 and 100);
