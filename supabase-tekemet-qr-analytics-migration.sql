-- Tekemet QR sources and analytics V2.
-- Safe to run repeatedly in the Tekemet Supabase SQL Editor.
-- This migration does not delete or reset existing menu or analytics data.

begin;

create extension if not exists pgcrypto;

create table if not exists public.qr_sources (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  public_id text not null unique default left(replace(gen_random_uuid()::text, '-', ''), 20),
  source_type text not null default 'qr',
  menu_path text not null default '/menu',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tekemet_qr_sources_name_check check (char_length(btrim(name)) between 1 and 100),
  constraint tekemet_qr_sources_public_id_check check (public_id ~ '^[a-zA-Z0-9_-]{12,64}$'),
  constraint tekemet_qr_sources_type_check check (source_type in ('qr', 'link', 'social', 'direct'))
);

alter table public.menu_analytics_events add column if not exists category_id text;
alter table public.menu_analytics_events add column if not exists qr_source_id uuid references public.qr_sources(id) on delete set null;
alter table public.menu_analytics_events add column if not exists source_fallback text;
alter table public.menu_analytics_events add column if not exists duration_ms integer;
alter table public.menu_analytics_events add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Tekemet dishes are stored in content_items. The former FK pointed to the
-- unused menu_items mirror and rejected real content_items identifiers.
alter table public.menu_analytics_events drop constraint if exists menu_analytics_events_menu_item_id_fkey;

alter table public.menu_analytics_events drop constraint if exists menu_analytics_event_type_check;
alter table public.menu_analytics_events drop constraint if exists menu_analytics_events_event_type_check;
alter table public.menu_analytics_events add constraint menu_analytics_events_event_type_check
  check (event_type in (
    'menu_open', 'session_start', 'category_view', 'dish_open', 'dish_close',
    'dish_photo_open', 'search', 'search_no_results', 'language_change', 'menu_exit'
  ));

alter table public.menu_analytics_events drop constraint if exists menu_analytics_events_language_check;
alter table public.menu_analytics_events add constraint menu_analytics_events_language_check
  check (language is null or language in ('ru', 'kk', 'kz', 'en', 'tr'));

alter table public.menu_analytics_events drop constraint if exists menu_analytics_events_duration_check;
alter table public.menu_analytics_events add constraint menu_analytics_events_duration_check
  check (duration_ms is null or duration_ms between 0 and 86400000);

alter table public.menu_analytics_events drop constraint if exists menu_analytics_events_source_fallback_check;
alter table public.menu_analytics_events add constraint menu_analytics_events_source_fallback_check
  check (source_fallback is null or char_length(source_fallback) <= 120);

create index if not exists tekemet_qr_sources_restaurant_idx on public.qr_sources (restaurant_id, created_at desc);
create index if not exists tekemet_qr_sources_public_active_idx on public.qr_sources (public_id) where is_active;
create index if not exists tekemet_analytics_source_created_idx on public.menu_analytics_events (restaurant_id, qr_source_id, created_at desc);
create index if not exists tekemet_analytics_session_event_idx on public.menu_analytics_events (restaurant_id, session_id, event_type, created_at);
create index if not exists tekemet_analytics_category_idx on public.menu_analytics_events (category_id) where category_id is not null;

drop trigger if exists tekemet_qr_sources_set_updated_at on public.qr_sources;
create trigger tekemet_qr_sources_set_updated_at
before update on public.qr_sources
for each row execute function public.set_updated_at();

alter table public.qr_sources enable row level security;
grant all on public.qr_sources to service_role;

comment on table public.qr_sources is 'Stable Tekemet menu entry points. Direct entry is represented virtually and is not inserted here.';
comment on column public.menu_analytics_events.source_fallback is 'Stable fallback source key. Events without a recognized QR source use direct.';
comment on column public.menu_analytics_events.duration_ms is 'Measured menu or dish study duration in milliseconds.';

commit;
