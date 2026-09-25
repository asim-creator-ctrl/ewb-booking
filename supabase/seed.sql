-- Starting configuration. Every value here is a placeholder, editable from /admin.

insert into settings (id) values (1) on conflict do nothing;

with s as (
  insert into services (name, description, sort) values
    ('Photography', 'Personal portraits, fashion, creator content, lifestyle.', 1),
    ('Photography + Short Video', 'Photography plus a limited number of short video clips.', 2)
  returning id, name
)
insert into service_durations (service_id, minutes, price_paise, sort)
select s.id, d.minutes,
       case when s.name = 'Photography' then d.photo else d.combo end,
       d.sort
from s cross join (values
  (60,  500000,  750000, 1),
  (120, 900000, 1300000, 2),
  (180, 1300000, 1800000, 3)
) as d(minutes, photo, combo, sort);

insert into location_options (setting, label, charge_type, amount_paise, uses_zone, note, sort) values
  ('outdoor', 'Outdoor location',        'included', 0, true,  'Paid locations, permits and entry fees are not included.', 1),
  ('indoor',  'Your place',              'included', 0, true,  null, 2),
  ('indoor',  'Studio',                  'quote',    0, false, 'Studio rental is not included in the shoot fee. I''ll confirm the cost before the shoot.', 3),
  ('indoor',  'Other indoor location',   'quote',    0, true,  'Any venue or rental cost is charged separately.', 4);

insert into location_zones (name, description, charge_paise, requires_quote, sort) values
  ('North Kolkata',              'Shyambazar, Kumartuli, Bagbazar, Sovabazar', 0,      false, 1),
  ('Central Kolkata',            'Esplanade, Park Street, College Street',    0,      false, 2),
  ('South Kolkata',              'Gariahat, Ballygunge, Tollygunge, Behala',  50000,  false, 3),
  ('Salt Lake / New Town',       null,                                        80000,  false, 4),
  ('Howrah / Hooghly side',      null,                                        80000,  false, 5),
  ('Outside Kolkata',            'Custom quote before booking',              0,      true,  6);

insert into inclusions (text, is_included, sort) values
  ('My shooting time for the booked duration', true, 1),
  ('Professional photography',                 true, 2),
  ('Basic photo selection',                    true, 3),
  ('Basic colour correction',                  true, 4),
  ('Final edited images',                      true, 5),
  ('Selected short video clips (Photography + Short Video only)', true, 6),
  ('Makeup artist',                false, 1),
  ('Hairstyling and grooming',     false, 2),
  ('Styling and outfits',          false, 3),
  ('Props',                        false, 4),
  ('Studio rental',                false, 5),
  ('Paid location charges',        false, 6),
  ('Special permits',              false, 7),
  ('Additional travel expenses',   false, 8);

insert into charge_items (name, default_amount_paise, sort) values
  ('Studio rental', null, 1), ('Location rental', null, 2), ('Travel', null, 3),
  ('Props', null, 4), ('Special equipment', null, 5), ('Permit fees', null, 6),
  ('Accommodation', null, 7), ('Other third-party expense', null, 8);

-- Every day 10:00–14:00 and 15:00–19:00 (break 14:00–15:00)
insert into weekly_hours (weekday, start_time, end_time)
select d, t.s, t.e from generate_series(0, 6) d
cross join (values ('10:00'::time, '14:00'::time), ('15:00'::time, '19:00'::time)) t(s, e);

insert into reminder_rules (name, offset_minutes, template) values
  ('7 days before',  -10080, 'reminder_7d'),
  ('24 hours before', -1440, 'reminder_24h'),
  ('2 hours before',   -120, 'reminder_2h'),
  ('Balance after shoot', 180, 'balance_due');

insert into policies (type, version, title, body, active) values
  ('cancellation', 1, 'Cancellation policy',
   'Your date is reserved specifically for you. The 50% advance confirms the booking and may be subject to the cancellation and rescheduling policy. [Final policy to be added.]', true),
  ('rescheduling', 1, 'Rescheduling policy', '[Final policy to be added.]', true),
  ('terms',        1, 'Terms of booking',    '[Final terms to be added.]', true);
