import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, UnauthorizedError } from '@/lib/admin-auth';
import {
  checkKeyExists,
  createDatasetWithImages,
  listDatasetsWithCounts,
} from '@/lib/admin-actions';
import {
  extractFolderId,
  fetchDriveImages,
  PrivateFolderError,
  FolderNotFoundError,
} from '@/lib/drive';
import { generateUniqueAccessKey } from '@/lib/access-key';
import { parseJson } from '@/lib/validation';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw e;
  }

  try {
    const items = await listDatasetsWithCounts();
    return NextResponse.json(
      { datasets: items },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list datasets.' },
      { status: 500 }
    );
  }
}

interface ManualFile { fileId: string; fileName: string; }

function parseManualList(raw: string): ManualFile[] {
  const out: ManualFile[] = [];
  const seen = new Set<string>();
  const lines = raw.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    // Split on the first comma only — filenames can contain commas.
    const comma = line.indexOf(',');
    if (comma < 0) {
      throw new Error(`Line ${i + 1}: expected "fileName,fileId".`);
    }
    const fileName = line.slice(0, comma).trim();
    const fileId = line.slice(comma + 1).trim();

    if (!fileName) throw new Error(`Line ${i + 1}: filename is empty.`);
    if (!fileId) throw new Error(`Line ${i + 1}: fileId is empty.`);
    if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) {
      throw new Error(`Line ${i + 1}: fileId looks invalid (${fileId.slice(0, 12)}...).`);
    }
    if (seen.has(fileId)) continue;
    seen.add(fileId);

    out.push({ fileId, fileName });
  }

  if (out.length === 0) {
    throw new Error('No valid lines found.');
  }

  return out;
}

const createSchema = z
  .object({
    name: z.string().min(1).max(200),
    driveUrl: z.string().max(2048).optional(),
    manualList: z.string().max(200_000).optional(),
  })
  .refine(
    (b) => Boolean(b.manualList?.trim()) || Boolean(b.driveUrl?.trim()),
    { message: 'Either driveUrl or manualList is required.' }
  );

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw e;
  }

  const parsed = await parseJson(req, createSchema);
  if (!parsed.ok) return NextResponse.json(parsed.response.body, { status: parsed.response.status });
  const body = parsed.data;

  try {
    let driveUrl = '';
    let folderId = '';
    let files: { id: string; name: string }[] = [];

    if (body.manualList !== undefined && body.manualList.length > 0) {
      // Manual paste mode.
      const parsed2 = parseManualList(body.manualList);
      files = parsed2.map((f) => ({ id: f.fileId, name: f.fileName }));
      driveUrl = 'manual';
      folderId = '';
    } else {
      const folderInput = (body.driveUrl ?? '').trim();
      const extracted = extractFolderId(folderInput);
      if (!extracted) {
        return NextResponse.json(
          {
            error:
              'That does not look like a Google Drive folder link. Paste the full URL, e.g. https://drive.google.com/drive/folders/…',
          },
          { status: 400 }
        );
      }
      folderId = extracted;
      driveUrl = `https://drive.google.com/drive/folders/${folderId}`;

      try {
        files = await fetchDriveImages(folderId);
      } catch (err) {
        if (err instanceof PrivateFolderError || err instanceof FolderNotFoundError) {
          return NextResponse.json({ error: err.message }, { status: 422 });
        }
        throw err;
      }

      if (files.length === 0) {
        return NextResponse.json(
          {
            error:
              "No image files were found in this folder. Make sure sharing is set to 'Anyone with the link' and that the folder contains .jpg, .jpeg, .png, .webp, .gif, or .bmp files.",
          },
          { status: 422 }
        );
      }
    }

    const accessKey = await generateUniqueAccessKey(checkKeyExists, 10);

    const dataset = await createDatasetWithImages({
      name: body.name,
      driveUrl,
      folderId,
      accessKey,
      files,
    });

    return NextResponse.json({
      ok: true,
      dataset: {
        id: dataset.id,
        name: dataset.name,
        access_key: dataset.access_key,
        created_at: dataset.created_at,
        imageCount: files.length,
      },
      key: accessKey,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create dataset.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
