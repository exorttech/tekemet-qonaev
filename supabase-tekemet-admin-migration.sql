-- Tekemet Qonaev admin schema sync.
-- Run in Tekemet Supabase SQL Editor. Safe to run repeatedly.

create extension if not exists pgcrypto;

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  city text,
  timezone text not null default 'Asia/Almaty',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name_ru text not null,
  name_kz text,
  name_en text,
  title_ru text,
  title_kk text,
  title_en text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id uuid references public.menu_categories(id) on delete set null,
  content_key text,
  name_ru text,
  name_kz text,
  name_en text,
  title_ru text,
  title_kk text,
  title_en text,
  description_ru text,
  description_kz text,
  description_kk text,
  description_en text,
  price int not null default 0,
  old_price int,
  weight text,
  portion text,
  calories int,
  spice_level text,
  currency text not null default 'KZT',
  image_url text,
  image_path text,
  is_active boolean not null default true,
  is_stoplisted boolean not null default false,
  inactive_until timestamptz,
  sort_order int not null default 0,
  tags jsonb not null default '[]'::jsonb,
  allergens jsonb not null default '[]'::jsonb,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare
  menu_item_id_type text;
begin
  select format_type(attribute.atttypid, attribute.atttypmod)
    into menu_item_id_type
  from pg_attribute attribute
  where attribute.attrelid = 'public.menu_items'::regclass
    and attribute.attname = 'id'
    and not attribute.attisdropped;

  if menu_item_id_type is null then
    raise exception 'public.menu_items.id column was not found';
  end if;

  execute format($create_table$
    create table if not exists public.menu_analytics_events (
      id uuid primary key default gen_random_uuid(),
      restaurant_id uuid not null references public.restaurants(id) on delete cascade,
      event_type text not null,
      menu_item_id %s references public.menu_items(id) on delete set null,
      language text,
      device_type text,
      session_id text,
      user_agent text,
      referrer text,
      created_at timestamptz not null default now(),
      constraint menu_analytics_event_type_check check (event_type in ('menu_open', 'dish_open', 'language_change')),
      constraint menu_analytics_device_type_check check (device_type is null or device_type in ('mobile', 'tablet', 'desktop'))
    )
  $create_table$, menu_item_id_type);
end $$;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'restaurants_set_updated_at') then
    create trigger restaurants_set_updated_at before update on public.restaurants for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'menu_categories_set_updated_at') then
    create trigger menu_categories_set_updated_at before update on public.menu_categories for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'menu_items_set_updated_at') then
    create trigger menu_items_set_updated_at before update on public.menu_items for each row execute function public.set_updated_at();
  end if;
end $$;

create index if not exists idx_menu_categories_restaurant_sort on public.menu_categories(restaurant_id, sort_order);
create index if not exists idx_menu_items_restaurant_category_sort on public.menu_items(restaurant_id, category_id, sort_order);
create index if not exists idx_menu_items_restaurant_active on public.menu_items(restaurant_id, is_active, is_stoplisted);
create index if not exists idx_menu_analytics_restaurant_created on public.menu_analytics_events(restaurant_id, created_at desc);
create index if not exists idx_menu_analytics_event_type on public.menu_analytics_events(restaurant_id, event_type, created_at desc);
create index if not exists idx_menu_analytics_item on public.menu_analytics_events(restaurant_id, menu_item_id, created_at desc);
create index if not exists idx_menu_analytics_language on public.menu_analytics_events(restaurant_id, language, created_at desc);
create index if not exists idx_menu_analytics_device on public.menu_analytics_events(restaurant_id, device_type, created_at desc);
create index if not exists idx_menu_analytics_session on public.menu_analytics_events(restaurant_id, session_id, created_at desc);

alter table public.restaurants enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.menu_analytics_events enable row level security;

drop policy if exists restaurants_public_select_active on public.restaurants;
create policy restaurants_public_select_active on public.restaurants for select using (is_active = true);

drop policy if exists menu_categories_public_select_active on public.menu_categories;
create policy menu_categories_public_select_active on public.menu_categories for select using (is_active = true and exists (select 1 from public.restaurants r where r.id = restaurant_id and r.is_active = true));

drop policy if exists menu_items_public_select_active on public.menu_items;
create policy menu_items_public_select_active on public.menu_items for select using (is_active = true and exists (select 1 from public.restaurants r where r.id = restaurant_id and r.is_active = true));

insert into public.restaurants (slug, name, city, timezone, is_active)
values ('tekemet-qonaev', 'Tekemet Qonaev', 'Qonaev', 'Asia/Almaty', true)
on conflict (slug) do update set name = excluded.name, city = excluded.city, timezone = excluded.timezone, is_active = excluded.is_active;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('restaurant-assets', 'restaurant-assets', true, 10485760, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = excluded.public;
