-- Meme Annotator — migration 001
-- Make (dataset_id, name) case-insensitive at the DB level.
--
-- The original `unique (dataset_id, name)` is case-sensitive. The
-- annotator login page treats name as case-insensitive (so "Alice" and
-- "alice" resume the same user), so we need a functional unique index.
--
-- We add a `unique` index on `(dataset_id, lower(name))`. The original
-- constraint is left in place as a plain btree (non-unique) so reads
-- are still fast, and a small `check` keeps names from being empty.
--
-- Run this in the Supabase SQL editor after `schema.sql`.

-- Drop the original unique constraint and rebuild it as a plain index
-- (so reads stay fast) — but only if it exists. The schema creates the
-- unique inline on the table; for safety we try both shapes.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'users_dataset_id_name_key'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users drop constraint users_dataset_id_name_key;
  end if;
end $$;

create index if not exists users_dataset_id_name_idx
  on public.users (dataset_id, name);

create unique index if not exists users_dataset_id_lower_name_uniq
  on public.users (dataset_id, lower(name));

-- Defense in depth: name must not be blank.
alter table public.users
  add constraint users_name_not_blank_chk
  check (length(btrim(name)) > 0) not valid;
alter table public.users validate constraint users_name_not_blank_chk;
