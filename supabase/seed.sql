-- OneLocal Rider — development seed: Latur reference data (no people, no customer data).
--
-- The same world as the app's local demo (OL-ui/rider/src/demo/seed.ts): Maharashtra → Latur →
-- 4 zones, the Express MegaMart store hub, and the Latur earnings rule v3. Amounts are illustrative
-- samples, not production rates (spec R10). Safe to run more than once.
--
-- Runs automatically on `supabase db reset` (local). Use it on a development / staging project
-- only, never on the One Local Master database.

set search_path = public, extensions;

insert into public.ol_service_areas (city_id, name, center, radius_km)
values ('latur', 'Latur', 'SRID=4326;POINT(76.5604 18.4088)', 8)
on conflict (city_id) do nothing;

insert into public.geo_states (code, name, default_language)
values ('MH', 'Maharashtra', 'mr')
on conflict (code) do nothing;

insert into public.geo_cities (id, state_code, name, center, timezone, cash_limit)
values ('latur', 'MH', 'Latur', 'SRID=4326;POINT(76.5604 18.4088)', 'Asia/Kolkata', 2000)
on conflict (id) do nothing;

-- Zones: 0.04° boxes (about 4.4 × 4.2 km), corners as lng lat.
insert into public.geo_zones (id, city_id, name, boundary, neighbours) values
  ('latur-central', 'latur', 'Latur Central', 'SRID=4326;POLYGON((76.548 18.427, 76.588 18.427, 76.588 18.387, 76.548 18.387, 76.548 18.427))', '{latur-east,latur-west,latur-north}'),
  ('latur-east',    'latur', 'Latur East',    'SRID=4326;POLYGON((76.588 18.427, 76.628 18.427, 76.628 18.387, 76.588 18.387, 76.588 18.427))', '{latur-central,latur-north}'),
  ('latur-west',    'latur', 'Latur West',    'SRID=4326;POLYGON((76.508 18.427, 76.548 18.427, 76.548 18.387, 76.508 18.387, 76.508 18.427))', '{latur-central}'),
  ('latur-north',   'latur', 'Latur North',   'SRID=4326;POLYGON((76.548 18.467, 76.588 18.467, 76.588 18.427, 76.548 18.427, 76.548 18.467))', '{latur-central,latur-east}')
on conflict (id) do nothing;

-- The city outline is the union of its zones until a real polygon is drawn.
update public.geo_cities c
   set boundary = (select ST_Multi(ST_Union(z.boundary::geometry))::geography from public.geo_zones z where z.city_id = c.id)
 where c.id = 'latur' and c.boundary is null;

insert into public.organizations (id, name, kind)
values ('0b1c0000-0000-4000-8000-000000000001', 'Express Retail Pvt Ltd', 'merchant')
on conflict (id) do nothing;

insert into public.ol_stores (id, organization_id, name, city_id, location, address)
values ('store-express-megamart', '0b1c0000-0000-4000-8000-000000000001', 'Express MegaMart', 'latur',
        'SRID=4326;POINT(76.5711 18.4062)', 'Main Road, Latur Central')
on conflict (id) do nothing;

insert into public.hubs (id, zone_id, kind, organization_id, store_id, name, location, address, landmark, accuracy_m, source, entrance_note)
values ('0b1c0000-0000-4000-8000-0000000000a1', 'latur-central', 'store', '0b1c0000-0000-4000-8000-000000000001',
        'store-express-megamart', 'Store A', 'SRID=4326;POINT(76.5711 18.4062)', 'Express MegaMart, Main Road, Latur Central',
        'Opp. Ganesh Mandir', 6, 'merchant_pin', 'Delivery counter at the side gate')
on conflict (id) do nothing;

insert into public.earnings_rules (city_id, version, base, per_km, peak, wait_free_min, wait_per_min, active_from)
values ('latur', 3, 45, 6,
        '[{"from": "12:00", "to": "14:00", "amount": 15, "label": "Lunch peak"},
          {"from": "19:00", "to": "22:00", "amount": 15, "label": "Dinner peak"}]',
        10, 2, '2026-09-01T00:00:00+05:30')
on conflict (city_id, version) do nothing;
