import 'server-only';
import { getSupabaseAdmin } from './supabase';
import { DatasetRow } from './admin-actions';

export type HarmSource = 'text' | 'image' | 'both' | 'none';
const HARM_SOURCES: readonly HarmSource[] = ['text', 'image', 'both', 'none'] as const;
export function isHarmSource(v: unknown): v is HarmSource {
  return typeof v === 'string' && (HARM_SOURCES as readonly string[]).includes(v);
}

export interface UserRow {
  id: string;
  dataset_id: string;
  name: string;
  created_at: string;
}

export interface ImageRow {
  id: string;
  file_id: string;
  file_name: string;
  position: number;
}

export interface AnnotatorState {
  dataset: DatasetRow;
  images: ImageRow[];
  /** image.id -> harm source. */
  annotations: Record<string, HarmSource>;
  firstUnannotatedIndex: number;
}

/** Normalize the access key the way the user types it: uppercase, no hyphen. */
export function normalizeAccessKey(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

export async function findDatasetByAccessKey(rawKey: string): Promise<DatasetRow | null> {
  const supabase = getSupabaseAdmin();
  const normalized = normalizeAccessKey(rawKey);
  if (normalized.length < 6) return null;

  // Try the normalized form first. If the key in DB is stored in the
  // human-friendly form (with hyphen, uppercase), this misses — fall
  // back to a hyphen-stripped compare in SQL.
  const { data: byExact, error: e1 } = await supabase
    .from('datasets')
    .select('*')
    .eq('access_key', normalized)
    .maybeSingle();
  if (e1) throw new Error(`Lookup failed: ${e1.message}`);
  if (byExact) return byExact as DatasetRow;

  // Fallback: search by stripped form using a JS-side compare. With
  // a small number of datasets this is fine; if you ever have
  // thousands, add a generated column or a functional index.
  const { data: all, error: e2 } = await supabase.from('datasets').select('*');
  if (e2) throw new Error(`Lookup failed: ${e2.message}`);
  const match = (all ?? []).find(
    (d) => normalizeAccessKey(d.access_key) === normalized
  );
  return (match as DatasetRow) ?? null;
}

/** Trim, collapse internal whitespace, drop surrounding spaces. */
export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * Look up the user case-insensitively. If not found, create. On insert
 * race (rare), re-read. The DB-level unique index on
 * `(dataset_id, lower(name))` is the source of truth.
 */
export async function getOrCreateUser(
  datasetId: string,
  rawName: string
): Promise<UserRow> {
  const supabase = getSupabaseAdmin();
  const name = normalizeName(rawName);
  if (name.length === 0) {
    throw new Error('Name must not be empty.');
  }
  if (name.length > 200) {
    throw new Error('Name is too long.');
  }

  // ilike is case-insensitive in Postgres text comparisons.
  const { data: existing, error: readErr } = await supabase
    .from('users')
    .select('*')
    .eq('dataset_id', datasetId)
    .ilike('name', name)
    .maybeSingle();
  if (readErr) throw new Error(`User lookup failed: ${readErr.message}`);
  if (existing) return existing as UserRow;

  const { data: created, error: insErr } = await supabase
    .from('users')
    .insert({ dataset_id: datasetId, name })
    .select('*')
    .single();

  if (!insErr && created) return created as UserRow;

  // Insert race or unique violation: re-read.
  if (insErr) {
    const { data: retry, error: reErr } = await supabase
      .from('users')
      .select('*')
      .eq('dataset_id', datasetId)
      .ilike('name', name)
      .maybeSingle();
    if (reErr) throw new Error(`User lookup failed: ${reErr.message}`);
    if (retry) return retry as UserRow;
    throw new Error(`User create failed: ${insErr.message}`);
  }

  throw new Error('User create failed for an unknown reason.');
}

export async function loadAnnotatorState(
  userId: string,
  datasetId: string
): Promise<AnnotatorState> {
  const supabase = getSupabaseAdmin();

  const [{ data: ds, error: dsErr }, { data: imgs, error: imgErr }, { data: anns, error: annErr }] =
    await Promise.all([
      supabase.from('datasets').select('*').eq('id', datasetId).maybeSingle(),
      supabase
        .from('images')
        .select('id, file_id, file_name, position')
        .eq('dataset_id', datasetId)
        .order('position', { ascending: true }),
      supabase
        .from('annotations')
        .select('image_id, harm_source')
        .eq('user_id', userId),
    ]);

  if (dsErr) throw new Error(`Failed to load dataset: ${dsErr.message}`);
  if (!ds) throw new Error('Dataset not found.');
  if (imgErr) throw new Error(`Failed to load images: ${imgErr.message}`);
  if (annErr) throw new Error(`Failed to load annotations: ${annErr.message}`);

  const images: ImageRow[] = (imgs ?? []) as ImageRow[];
  const annotations: Record<string, HarmSource> = {};
  for (const a of anns ?? []) {
    if (isHarmSource(a.harm_source)) {
      annotations[a.image_id as string] = a.harm_source;
    }
  }

  const firstUnannotatedIndex = images.findIndex((img) => !annotations[img.id]);

  return {
    dataset: ds as DatasetRow,
    images,
    annotations,
    firstUnannotatedIndex,
  };
}

/**
 * Upsert an annotation. The schema has `unique(user_id, image_id)`, so
 * `onConflict` upserts cleanly. Validates the harm source before
 * touching the DB.
 */
export async function upsertAnnotation(args: {
  userId: string;
  imageId: string;
  datasetId: string; // for the cross-dataset ownership check
  harmSource: HarmSource;
}): Promise<{ imageId: string; harmSource: HarmSource; updatedAt: string }> {
  if (!isHarmSource(args.harmSource)) {
    throw new Error('Invalid harm source.');
  }

  const supabase = getSupabaseAdmin();

  // Verify the image belongs to the user's dataset. Defense-in-depth:
  // the user should never be able to write to a foreign image.
  const { data: img, error: imgErr } = await supabase
    .from('images')
    .select('id, dataset_id')
    .eq('id', args.imageId)
    .maybeSingle();
  if (imgErr) throw new Error(`Image lookup failed: ${imgErr.message}`);
  if (!img || img.dataset_id !== args.datasetId) {
    throw new Error('Image not found in this dataset.');
  }

  const { data, error } = await supabase
    .from('annotations')
    .upsert(
      {
        user_id: args.userId,
        image_id: args.imageId,
        harm_source: args.harmSource,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,image_id' }
    )
    .select('image_id, harm_source, updated_at')
    .single();

  if (error || !data) {
    throw new Error(`Save failed: ${error?.message ?? 'unknown'}`);
  }

  return {
    imageId: data.image_id as string,
    harmSource: data.harm_source as HarmSource,
    updatedAt: data.updated_at as string,
  };
}

export interface CsvRow {
  fileName: string;
  harmSource: HarmSource;
}

/** Get the user's annotations, joined to file_name and ordered by position. */
export async function getCsvForUser(
  userId: string,
  datasetId: string
): Promise<CsvRow[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('annotations')
    .select('image_id, harm_source, images!inner(file_name, position, dataset_id)')
    .eq('user_id', userId)
    .eq('images.dataset_id', datasetId)
    .order('position', { referencedTable: 'images', ascending: true });

  if (error) throw new Error(`Failed to read annotations: ${error.message}`);

  const rows: CsvRow[] = [];
  for (const a of data ?? []) {
    if (!isHarmSource(a.harm_source)) continue;
    // Supabase's nested select shape: { image_id, harm_source, images: { file_name, ... } }
    const img = (a as any).images as { file_name: string } | undefined;
    if (!img) continue;
    rows.push({ fileName: img.file_name, harmSource: a.harm_source });
  }
  return rows;
}
