import 'server-only';
import { getSupabaseAdmin } from './supabase';
import { DriveFile } from './drive';

export interface DatasetRow {
  id: string;
  name: string;
  drive_url: string;
  folder_id: string;
  access_key: string;
  created_at: string;
}

export interface DatasetListItem extends DatasetRow {
  imageCount: number;
  userCount: number;
}

export interface DatasetWithImages extends DatasetRow {
  images: { id: string; file_id: string; file_name: string; position: number }[];
}

/**
 * Insert a dataset plus its image rows. If the images insert fails after
 * the dataset is created, attempt to clean up the dataset row before
 * re-throwing. This is not a true transaction (Supabase JS has no easy
 * transaction API for this case), but the cleanup minimizes orphans.
 */
export async function createDatasetWithImages(args: {
  name: string;
  driveUrl: string;
  folderId: string;
  accessKey: string;
  files: DriveFile[];
}): Promise<DatasetWithImages> {
  const supabase = getSupabaseAdmin();

  const { data: ds, error: dsErr } = await supabase
    .from('datasets')
    .insert({
      name: args.name,
      drive_url: args.driveUrl,
      folder_id: args.folderId,
      access_key: args.accessKey,
    })
    .select('*')
    .single();

  if (dsErr || !ds) {
    throw new Error(`Failed to create dataset: ${dsErr?.message ?? 'unknown'}`);
  }

  if (args.files.length > 0) {
    const rows = args.files.map((f, i) => ({
      dataset_id: ds.id,
      file_id: f.id,
      file_name: f.name,
      position: i,
    }));

    const { error: imgErr } = await supabase.from('images').insert(rows);
    if (imgErr) {
      // Best-effort cleanup.
      await supabase.from('datasets').delete().eq('id', ds.id);
      throw new Error(`Failed to insert images: ${imgErr.message}`);
    }
  }

  return {
    ...(ds as DatasetRow),
    images: args.files.map((f, i) => ({
      id: '',
      file_id: f.id,
      file_name: f.name,
      position: i,
    })),
  };
}

export async function checkKeyExists(key: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('datasets')
    .select('id')
    .eq('access_key', key)
    .maybeSingle();
  if (error) {
    // Treat query errors as "could not confirm uniqueness" — the caller should retry.
    return true;
  }
  return !!data;
}

export async function listDatasetsWithCounts(): Promise<DatasetListItem[]> {
  const supabase = getSupabaseAdmin();

  // First fetch the dataset list — without it we don't know which
  // dataset ids to count for. Then in parallel, count images AND
  // count users per dataset in a single round-trip each. Avoids the
  // N+1 trap of fetching one dataset's images and users at a time.
  const { data: datasets, error: dsErr } = await supabase
    .from('datasets')
    .select('*')
    .order('created_at', { ascending: false });

  if (dsErr) throw new Error(`Failed to list datasets: ${dsErr.message}`);
  if (!datasets || datasets.length === 0) return [];

  const ids = datasets.map((d) => d.id);

  const [imgRes, userRes] = await Promise.all([
    supabase.from('images').select('dataset_id').in('dataset_id', ids),
    supabase.from('users').select('dataset_id').in('dataset_id', ids),
  ]);

  if (imgRes.error) throw new Error(`Failed to count images: ${imgRes.error.message}`);
  if (userRes.error) throw new Error(`Failed to count users: ${userRes.error.message}`);

  const imgTally = new Map<string, number>();
  for (const row of imgRes.data ?? []) {
    const k = row.dataset_id as string;
    imgTally.set(k, (imgTally.get(k) ?? 0) + 1);
  }
  const userTally = new Map<string, number>();
  for (const row of userRes.data ?? []) {
    const k = row.dataset_id as string;
    userTally.set(k, (userTally.get(k) ?? 0) + 1);
  }

  return datasets.map((d) => ({
    ...(d as DatasetRow),
    imageCount: imgTally.get(d.id) ?? 0,
    userCount: userTally.get(d.id) ?? 0,
  }));
}

export async function getDataset(id: string): Promise<DatasetRow | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('datasets')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load dataset: ${error.message}`);
  return (data as DatasetRow) ?? null;
}

export async function deleteDataset(id: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { error, count } = await supabase
    .from('datasets')
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) throw new Error(`Failed to delete dataset: ${error.message}`);
  return (count ?? 0) > 0;
}

export interface ResyncResult {
  added: number;
  total: number;
}

/* -------------------------------------------------------------------------- */
/*  Dataset detail page — users, stats, exports                              */
/* -------------------------------------------------------------------------- */

export interface UserStats {
  id: string;
  name: string;
  annotatedCount: number;
  totalCount: number;
  /** ms timestamp of the most recent annotation, or null. */
  lastActivityAt: string | null;
  /** When they first registered. */
  createdAt: string;
}

export interface DatasetOverview {
  totalUsers: number;
  totalAnnotations: number;
  totalSlots: number; // total users × total images
  completionPct: number; // 0..100
  distribution: Record<string, number>; // harm_source -> count
  lastActivityAt: string | null;
}

export interface DatasetDetail {
  dataset: DatasetRow;
  imageCount: number;
  users: UserStats[];
  overview: DatasetOverview;
}

export async function getDatasetDetail(datasetId: string): Promise<DatasetDetail | null> {
  const supabase = getSupabaseAdmin();

  // Pull dataset, image count, users, and annotations in parallel.
  const [dsRes, imgsRes, usersRes, annsRes] = await Promise.all([
    supabase.from('datasets').select('*').eq('id', datasetId).maybeSingle(),
    supabase.from('images').select('id').eq('dataset_id', datasetId),
    supabase
      .from('users')
      .select('id, name, created_at')
      .eq('dataset_id', datasetId)
      .order('created_at', { ascending: true }),
    supabase
      .from('annotations')
      .select('user_id, image_id, harm_source, updated_at, images!inner(dataset_id)')
      .eq('images.dataset_id', datasetId),
  ]);

  if (dsRes.error) throw new Error(`Failed to load dataset: ${dsRes.error.message}`);
  if (!dsRes.data) return null;
  if (imgsRes.error) throw new Error(`Failed to load images: ${imgsRes.error.message}`);
  if (usersRes.error) throw new Error(`Failed to load users: ${usersRes.error.message}`);
  if (annsRes.error) throw new Error(`Failed to load annotations: ${annsRes.error.message}`);

  const dataset = dsRes.data as DatasetRow;
  const imageCount = (imgsRes.data ?? []).length;
  const users = (usersRes.data ?? []) as { id: string; name: string; created_at: string }[];
  const anns = (annsRes.data ?? []) as {
    user_id: string;
    image_id: string;
    harm_source: string;
    updated_at: string;
  }[];

  // Tally per user.
  const byUser = new Map<string, { count: number; last: string | null }>();
  for (const a of anns) {
    const cur = byUser.get(a.user_id) ?? { count: 0, last: null };
    cur.count += 1;
    if (!cur.last || a.updated_at > cur.last) cur.last = a.updated_at;
    byUser.set(a.user_id, cur);
  }

  const userStats: UserStats[] = users.map((u) => {
    const t = byUser.get(u.id);
    return {
      id: u.id,
      name: u.name,
      annotatedCount: t?.count ?? 0,
      totalCount: imageCount,
      lastActivityAt: t?.last ?? null,
      createdAt: u.created_at,
    };
  });

  // Sort by most-recent activity desc, then by name asc.
  userStats.sort((a, b) => {
    if (a.lastActivityAt && b.lastActivityAt) {
      return b.lastActivityAt.localeCompare(a.lastActivityAt);
    }
    if (a.lastActivityAt) return -1;
    if (b.lastActivityAt) return 1;
    return a.name.localeCompare(b.name);
  });

  // Overview / distribution.
  const distribution: Record<string, number> = { text: 0, image: 0, both: 0, none: 0 };
  let lastActivity: string | null = null;
  for (const a of anns) {
    if (distribution[a.harm_source] !== undefined) {
      distribution[a.harm_source] += 1;
    }
    if (!lastActivity || a.updated_at > lastActivity) lastActivity = a.updated_at;
  }

  const totalSlots = imageCount * users.length;
  const overview: DatasetOverview = {
    totalUsers: users.length,
    totalAnnotations: anns.length,
    totalSlots,
    completionPct: totalSlots === 0 ? 0 : (anns.length / totalSlots) * 100,
    distribution,
    lastActivityAt: lastActivity,
  };

  return { dataset, imageCount, users: userStats, overview };
}

export async function deleteUser(userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  // ON DELETE CASCADE removes their annotations.
  const { error, count } = await supabase
    .from('users')
    .delete({ count: 'exact' })
    .eq('id', userId);
  if (error) throw new Error(`Failed to delete user: ${error.message}`);
  return (count ?? 0) > 0;
}

/* -------------------------------------------------------------------------- */
/*  Annotation detail (with thumbnails)                                       */
/* -------------------------------------------------------------------------- */

export interface AnnotationItem {
  imageId: string;
  fileId: string;
  fileName: string;
  position: number;
  harmSource: HarmSource | null; // null = unannotated
  updatedAt: string | null;
}

export interface AnnotationsPage {
  items: AnnotationItem[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Get a single user's annotations for one dataset, ordered by image
 * position. Filter `filter` accepts: 'all' | 'unannotated' | one of the
 * harm sources. `search` filters by file_name (case-insensitive
 * substring). `pageSize` is honored for pagination; the client uses
 * virtualization on top of this.
 */
export async function getUserAnnotations(args: {
  userId: string;
  datasetId: string;
  filter?: 'all' | 'unannotated' | HarmSource;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<AnnotationsPage> {
  const supabase = getSupabaseAdmin();
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.min(500, Math.max(1, args.pageSize ?? 200));
  const filter = args.filter ?? 'all';
  const search = (args.search ?? '').trim();

  // First verify the user is in this dataset (defense in depth).
  const { data: user, error: uErr } = await supabase
    .from('users')
    .select('id, dataset_id')
    .eq('id', args.userId)
    .maybeSingle();
  if (uErr) throw new Error(`User lookup failed: ${uErr.message}`);
  if (!user || user.dataset_id !== args.datasetId) {
    throw new Error('User not in this dataset.');
  }

  // Pull all images in order, then join with this user's annotations.
  const imgsRes = await supabase
    .from('images')
    .select('id, file_id, file_name, position')
    .eq('dataset_id', args.datasetId)
    .order('position', { ascending: true });
  if (imgsRes.error) throw new Error(`Image list failed: ${imgsRes.error.message}`);

  const annsRes = await supabase
    .from('annotations')
    .select('image_id, harm_source, updated_at')
    .eq('user_id', args.userId);
  if (annsRes.error) throw new Error(`Annotation list failed: ${annsRes.error.message}`);

  const byImage = new Map<string, { harm: HarmSource; updated: string }>();
  for (const a of annsRes.data ?? []) {
    if (isHarmSource(a.harm_source)) {
      byImage.set(a.image_id as string, {
        harm: a.harm_source,
        updated: a.updated_at as string,
      });
    }
  }

  const lowerSearch = search.toLowerCase();
  const all: AnnotationItem[] = (imgsRes.data ?? []).map((row) => {
    const a = byImage.get(row.id as string);
    return {
      imageId: row.id as string,
      fileId: row.file_id as string,
      fileName: row.file_name as string,
      position: row.position as number,
      harmSource: a?.harm ?? null,
      updatedAt: a?.updated ?? null,
    };
  });

  const filtered = all.filter((item) => {
    if (filter === 'unannotated' && item.harmSource !== null) return false;
    if (filter !== 'all' && filter !== 'unannotated' && item.harmSource !== filter) {
      return false;
    }
    if (lowerSearch && !item.fileName.toLowerCase().includes(lowerSearch)) return false;
    return true;
  });

  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return { items, total: filtered.length, page, pageSize };
}

/* -------------------------------------------------------------------------- */
/*  CSV / ZIP exports                                                         */
/* -------------------------------------------------------------------------- */

import { buildCsv, sanitizeForFilename } from './csv';
import { HarmSource, isHarmSource } from './annotator-actions';

export interface CsvExportRow {
  fileName: string;
  harmSource: HarmSource;
}

/** A single user's CSV — same format as the annotator's own download. */
export function buildUserCsv(rows: CsvExportRow[]): string {
  return buildCsv(
    ['imageName', 'harmSource'],
    rows.map((r) => [r.fileName, r.harmSource])
  );
}

export interface CombinedRow {
  userName: string;
  accessKey: string;
  fileName: string;
  harmSource: HarmSource | '';
}

/**
 * Combined CSV: every (user, image) row in the dataset. The `harmSource`
 * cell is empty if the user hasn't annotated that image. Only included
 * for `includeEmpty=true` — when false, we drop the unannotated rows.
 */
export function buildDatasetCombinedCsv(
  rows: CombinedRow[],
  includeEmpty: boolean
): string {
  const out = includeEmpty
    ? rows
    : rows.filter((r) => r.harmSource !== '');
  return buildCsv(
    ['userName', 'accessKey', 'imageName', 'harmSource'],
    out.map((r) => [r.userName, r.accessKey, r.fileName, r.harmSource])
  );
}

/** Read all users + their annotations for a dataset. */
export async function readAllAnnotationsForDataset(
  datasetId: string
): Promise<CombinedRow[]> {
  const supabase = getSupabaseAdmin();

  const [usersRes, imgsRes, annsRes] = await Promise.all([
    supabase
      .from('users')
      .select('id, name')
      .eq('dataset_id', datasetId)
      .order('created_at', { ascending: true }),
    supabase
      .from('images')
      .select('id, file_name, position')
      .eq('dataset_id', datasetId)
      .order('position', { ascending: true }),
    supabase
      .from('annotations')
      .select('user_id, image_id, harm_source, images!inner(dataset_id)')
      .eq('images.dataset_id', datasetId),
  ]);

  if (usersRes.error) throw new Error(`User list failed: ${usersRes.error.message}`);
  if (imgsRes.error) throw new Error(`Image list failed: ${imgsRes.error.message}`);
  if (annsRes.error) throw new Error(`Annotation list failed: ${annsRes.error.message}`);

  const annByPair = new Map<string, HarmSource>();
  for (const a of annsRes.data ?? []) {
    if (isHarmSource(a.harm_source)) {
      annByPair.set(`${a.user_id}::${a.image_id}`, a.harm_source);
    }
  }

  const users = (usersRes.data ?? []) as { id: string; name: string }[];
  const imgs = (imgsRes.data ?? []) as { id: string; file_name: string }[];

  const rows: CombinedRow[] = [];
  for (const u of users) {
    for (const i of imgs) {
      const harm = annByPair.get(`${u.id}::${i.id}`) ?? '';
      rows.push({
        userName: u.name,
        accessKey: '', // filled in by caller (single-key dataset)
        fileName: i.file_name,
        harmSource: harm,
      });
    }
  }
  return rows;
}

/** Just the user's rows for CSV. */
export async function readUserAnnotationsForCsv(
  userId: string,
  datasetId: string
): Promise<CsvExportRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('annotations')
    .select('harm_source, images!inner(file_name, position, dataset_id)')
    .eq('user_id', userId)
    .eq('images.dataset_id', datasetId)
    .order('position', { referencedTable: 'images', ascending: true });
  if (error) throw new Error(`Annotation read failed: ${error.message}`);
  const out: CsvExportRow[] = [];
  for (const a of data ?? []) {
    if (!isHarmSource(a.harm_source)) continue;
    const img = (a as any).images as { file_name: string } | undefined;
    if (!img) continue;
    out.push({ fileName: img.file_name, harmSource: a.harm_source });
  }
  return out;
}

/** Build a per-user CSV filename, mirrored from the annotator's helper. */
export function userCsvFilename(name: string, key: string): string {
  return `${sanitizeForFilename(name)}_${sanitizeForFilename(key)}.csv`;
}

/**
 * Re-fetch the Drive folder and add any new image rows. Existing rows are
 * untouched. Updates `images.position` to reflect the new sorted order.
 */
export async function resyncDataset(
  datasetId: string,
  folderId: string,
  fetchFiles: () => Promise<DriveFile[]>
): Promise<ResyncResult> {
  const supabase = getSupabaseAdmin();
  const files = await fetchFiles();

  if (files.length === 0) {
    return { added: 0, total: 0 };
  }

  const { data: existing, error: exErr } = await supabase
    .from('images')
    .select('id, file_id, position')
    .eq('dataset_id', datasetId);
  if (exErr) throw new Error(`Failed to read existing images: ${exErr.message}`);

  const existingIds = new Set((existing ?? []).map((r) => r.file_id));
  const toAdd = files.filter((f) => !existingIds.has(f.id));

  if (toAdd.length > 0) {
    const startPosition = (existing ?? []).length;
    const rows = toAdd.map((f, i) => ({
      dataset_id: datasetId,
      file_id: f.id,
      file_name: f.name,
      position: startPosition + i,
    }));
    const { error: insErr } = await supabase.from('images').insert(rows);
    if (insErr) throw new Error(`Failed to insert new images: ${insErr.message}`);
  }

  return { added: toAdd.length, total: files.length };
}
