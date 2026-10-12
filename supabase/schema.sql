-- Meme Annotator — Supabase schema
-- Run in the Supabase SQL editor.
-- All access happens server-side via the service role key, so RLS is enabled
-- but no public policies are defined.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- datasets
-- ---------------------------------------------------------------------------
create table if not exists public.datasets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  drive_url   text not null,
  folder_id   text not null,
  access_key  text not null unique,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- images
-- ---------------------------------------------------------------------------
create table if not exists public.images (
  id          uuid primary key default gen_random_uuid(),
  dataset_id  uuid not null references public.datasets(id) on delete cascade,
  file_id     text not null,
  file_name   text not null,
  position    int  not null default 0,
  unique (dataset_id, file_id)
);
create index if not exists images_dataset_id_idx on public.images (dataset_id);
create index if not exists images_dataset_id_position_idx on public.images (dataset_id, position);

-- ---------------------------------------------------------------------------
-- users (annotators, scoped to a dataset)
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id          uuid primary key default gen_random_uuid(),
  dataset_id  uuid not null references public.datasets(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (dataset_id, name)
);
create index if not exists users_dataset_id_idx on public.users (dataset_id);

-- ---------------------------------------------------------------------------
-- annotations
-- ---------------------------------------------------------------------------
create table if not exists public.annotations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id)   on delete cascade,
  image_id     uuid not null references public.images(id) on delete cascade,
  harm_source  text not null check (harm_source in ('text','image','both','none')),
  updated_at   timestamptz not null default now(),
  unique (user_id, image_id)
);
create index if not exists annotations_user_id_idx  on public.annotations (user_id);
create index if not exists annotations_image_id_idx on public.annotations (image_id);
create index if not exists annotations_user_id_image_id_idx on public.annotations (user_id, image_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- No public policies. The service role key bypasses RLS, so all access from
-- the Next.js server continues to work, while the anon/authenticated roles
-- cannot read or write any rows directly.
-- ---------------------------------------------------------------------------
alter table public.datasets    enable row level security;
alter table public.images      enable row level security;
alter table public.users       enable row level security;
alter table public.annotations enable row level security;
