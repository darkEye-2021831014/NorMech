// Seed script for the Playwright e2e tests.
//
// Inserts a deterministic test dataset (with a known access key) and
// N image rows, then prints the dataset id, access key, and the
// list of image ids. The e2e test uses these to drive the flow.
//
// Idempotent: re-running clears any existing seed dataset of the
// same name before re-inserting.
//
// Plain ESM JS so it runs in node directly (no transpiler needed
// inside the Playwright Docker image).
//
// Usage:
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node tests/seed.mjs

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const SEED_DATASET_NAME = 'E2E seed dataset';
const SEED_ACCESS_KEY = 'E2EKEY0';
const SEED_IMAGE_COUNT = 6;
const SEED_PARTIAL_ANNOTATIONS = 2;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: existing, error: exErr } = await sb
  .from('datasets')
  .select('id')
  .eq('name', SEED_DATASET_NAME);
if (exErr) throw exErr;
if (existing && existing.length > 0) {
  for (const ds of existing) {
    const { error: delErr } = await sb.from('datasets').delete().eq('id', ds.id);
    if (delErr) throw delErr;
  }
}

const { data: ds, error: dsErr } = await sb
  .from('datasets')
  .insert({
    name: SEED_DATASET_NAME,
    drive_url: 'https://example.invalid/e2e-seed',
    folder_id: 'e2e-seed-folder',
    access_key: SEED_ACCESS_KEY,
  })
  .select('id, access_key')
  .single();
if (dsErr) throw dsErr;

const imageRows = Array.from({ length: SEED_IMAGE_COUNT }, (_, i) => ({
  dataset_id: ds.id,
  file_id: `e2e-fixture-${i + 1}`,
  file_name: `e2e-image-${String(i + 1).padStart(2, '0')}.jpg`,
  position: i,
}));
const { data: imgs, error: imgErr } = await sb
  .from('images')
  .insert(imageRows)
  .select('id, file_id, file_name, position')
  .order('position');
if (imgErr) throw imgErr;

if (process.env.SEED_PARTIAL === '1') {
  const { data: user, error: uErr } = await sb
    .from('users')
    .insert({ dataset_id: ds.id, name: 'e2e-resume-user' })
    .select('id')
    .single();
  if (uErr) throw uErr;

  const partialRows = imgs
    .slice(0, SEED_PARTIAL_ANNOTATIONS)
    .map((img) => ({
      user_id: user.id,
      image_id: img.id,
      harm_source: 'none',
      updated_at: new Date().toISOString(),
    }));
  const { error: annErr } = await sb.from('annotations').insert(partialRows);
  if (annErr) throw annErr;
}

const out = {
  datasetId: ds.id,
  accessKey: ds.access_key,
  imageIds: imgs.map((i) => i.id),
};
console.log(JSON.stringify(out));
