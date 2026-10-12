'use client';

import { useEffect, useMemo, useState, useRef, useCallback, KeyboardEvent } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Copy, RefreshCw, Trash2, FolderInput, ListOrdered, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

type Tab = 'drive' | 'manual';

export interface DatasetListItem {
  id: string;
  name: string;
  drive_url: string;
  folder_id: string;
  access_key: string;
  created_at: string;
  imageCount: number;
}

interface Props {
  initialDatasets: DatasetListItem[];
  initialError: string | null;
}

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export function DashboardClient({ initialDatasets, initialError }: Props) {
  const reduce = useReducedMotion();
  const { push } = useToast();

  const [datasets, setDatasets] = useState<DatasetListItem[]>(initialDatasets);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  const [tab, setTab] = useState<Tab>('drive');

  // Form state
  const [name, setName] = useState('');
  const [driveUrl, setDriveUrl] = useState('');
  const [manualList, setManualList] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/datasets', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to list (HTTP ${res.status}).`);
      const data = await res.json();
      setDatasets(data.datasets ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load datasets.');
    } finally {
      setLoading(false);
    }
  }, []);

  const totalImages = useMemo(
    () => datasets.reduce((acc, d) => acc + d.imageCount, 0),
    [datasets]
  );

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !name.trim()) return;

    setSubmitting(true);
    try {
      const payload: { name: string; driveUrl?: string; manualList?: string } = {
        name: name.trim(),
      };
      if (tab === 'drive') {
        payload.driveUrl = driveUrl.trim();
      } else {
        payload.manualList = manualList;
      }

      const res = await fetch('/api/admin/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Failed to create (HTTP ${res.status}).`);
      }

      push('success', `Dataset “${data.dataset.name}” created with ${data.dataset.imageCount} leaves. Key: ${data.key}`);
      // Optimistic prepend; full refresh will reconcile.
      setDatasets((d) => [
        {
          id: data.dataset.id,
          name: data.dataset.name,
          drive_url: payload.driveUrl ?? 'manual',
          folder_id: '',
          access_key: data.key,
          created_at: data.dataset.created_at,
          imageCount: data.dataset.imageCount,
        },
        ...d,
      ]);
      setName('');
      setDriveUrl('');
      setManualList('');
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Create failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="max-w-[1280px] mx-auto px-6 md:px-10 pt-12 md:pt-16 pb-24">
      {/* Page header */}
      <div className="mb-10 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="catalogue text-inkMuted mb-2">The curator&apos;s index</p>
          <h1 className="font-display text-[36px] sm:text-[44px] leading-[1.02] tracking-tightest text-ink">
            A ledger of{' '}
            <span className="italic text-ink/80">datasets</span>.
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="catalogue text-inkMuted">
            {datasets.length} {datasets.length === 1 ? 'dataset' : 'datasets'}
            <span className="mx-2 text-ink/30">·</span>
            {totalImages.toLocaleString()} leaves
          </span>
          <button
            onClick={refresh}
            disabled={loading}
            className="btn-touch inline-flex items-center gap-1.5 catalogue text-inkMuted hover:text-ink"
            aria-label="Refresh"
          >
            <RefreshCw size={12} strokeWidth={1.5} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* § NEW DATASET panel */}
      <div className="mb-16">
        <p className="catalogue text-vermilion mb-3 flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-vermilion rounded-full" aria-hidden />
          § I — New dataset
        </p>

        <div className="border border-ink/25 bg-cardBg rounded-sm">
          {/* Tabs — ink rules, not pills */}
          <div className="flex border-b border-ink/15">
            <TabButton
              active={tab === 'drive'}
              onClick={() => setTab('drive')}
              icon={<FolderInput size={14} strokeWidth={1.5} />}
              label="From Drive"
              hint="recommended"
            />
            <TabButton
              active={tab === 'manual'}
              onClick={() => setTab('manual')}
              icon={<ListOrdered size={14} strokeWidth={1.5} />}
              label="Paste list manually"
              hint="fallback"
            />
          </div>

          <form onSubmit={onCreate} className="p-5 sm:p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              <div className="md:col-span-5">
                <Input
                  label="Dataset name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={200}
                  disabled={submitting}
                  hint="Internal label — visible to you only."
                />
              </div>

              <div className="md:col-span-7">
                <AnimatePresence mode="wait" initial={false}>
                  {tab === 'drive' ? (
                    <motion.div
                      key="drive"
                      initial={reduce ? false : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
                      transition={{ duration: 0.18 }}
                    >
                      <Input
                        label="Google Drive folder URL"
                        value={driveUrl}
                        onChange={(e) => setDriveUrl(e.target.value)}
                        required
                        disabled={submitting}
                        placeholder="https://drive.google.com/drive/folders/…"
                        hint="Set the folder's sharing to 'Anyone with the link can view'."
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="manual"
                      initial={reduce ? false : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
                      transition={{ duration: 0.18 }}
                    >
                      <ManualListInput
                        value={manualList}
                        onChange={setManualList}
                        disabled={submitting}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 pt-1">
              <p className="catalogue text-inkMuted">
                {tab === 'drive'
                  ? 'Allowed: jpg, jpeg, png, webp, gif, bmp.'
                  : 'One entry per line, format: fileName,fileId'}
              </p>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={submitting || !name.trim() || (tab === 'drive' ? !driveUrl.trim() : !manualList.trim())}
              >
                {submitting
                  ? tab === 'drive'
                    ? 'Importing…'
                    : 'Saving…'
                  : tab === 'drive'
                  ? 'Import folder'
                  : 'Create from list'}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* § CATALOGUE OF DATASETS */}
      <div>
        <p className="catalogue text-vermilion mb-3 flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-vermilion rounded-full" aria-hidden />
          § II — Catalogue of datasets
        </p>

        {error && (
          <div className="mb-4 border border-vermilion/60 bg-vermilion/[0.06] text-vermilion px-4 py-3 font-mono text-[13px] rounded-sm">
            {error}
          </div>
        )}

        <DatasetTable
          datasets={datasets}
          loading={loading}
          onChange={setDatasets}
          onCopy={(key) => push('success', `Copied ${key}.`)}
          onInfo={(m) => push('info', m)}
          onError={(m) => push('error', m)}
        />
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tabs                                                                      */
/* -------------------------------------------------------------------------- */

function TabButton({
  active, onClick, icon, label, hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'btn-touch relative flex-1 sm:flex-none px-5 py-3 flex items-center justify-center gap-2',
        'font-mono uppercase tracking-widerish text-[12px]',
        'border-b-2 -mb-px transition-colors',
        active
          ? 'text-ink border-vermilion'
          : 'text-inkMuted border-transparent hover:text-ink'
      )}
      aria-pressed={active}
    >
      {icon}
      <span>{label}</span>
      <span className={cn('catalogue ml-1', active ? 'text-vermilion' : 'text-inkMuted/70')}>
        — {hint}
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Manual list input                                                         */
/* -------------------------------------------------------------------------- */

function ManualListInput({
  value, onChange, disabled,
}: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="w-full">
      <div
        className={cn(
          'relative border bg-paper transition-colors duration-150 ease-notebook rounded-sm',
          focused ? 'border-ink' : 'border-ink/30 hover:border-ink/60'
        )}
      >
        <label
          className={cn(
            'pointer-events-none absolute left-3 font-mono uppercase tracking-widerish transition-all duration-150 ease-notebook z-10',
            focused || value
              ? 'top-1.5 text-[10px] text-inkMuted'
              : 'top-3 text-[12px] text-inkMuted'
          )}
        >
          fileName,fileId — one per line
        </label>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
          rows={6}
          spellCheck={false}
          className={cn(
            'w-full bg-transparent px-3 pt-6 pb-2 text-[13px] font-mono text-ink outline-none resize-y',
            'placeholder:text-inkMuted/50'
          )}
          placeholder={'cat-meme.png,1aBcDeFgHiJkLmNoPqRsTuVwX\ndoge.jpg,2bCdEfGhIjKlMnOpQrStUvWxY'}
        />
      </div>
      <p className="mt-1.5 text-[11px] font-mono uppercase tracking-widerish text-inkMuted">
        Open any image in Drive, copy the id from the URL: /file/d/&lt;this part&gt;/view
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Dataset ledger table                                                      */
/* -------------------------------------------------------------------------- */

function DatasetTable({
  datasets, loading, onChange, onCopy, onInfo, onError,
}: {
  datasets: DatasetListItem[];
  loading: boolean;
  onChange: (next: DatasetListItem[]) => void;
  onCopy: (key: string) => void;
  onInfo: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const reduce = useReducedMotion();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const onCopyClick = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      onCopy(key);
    } catch {
      onError('Could not copy to clipboard.');
    }
  };

  const onDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/datasets/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Delete failed (HTTP ${res.status}).`);
      }
      onChange(datasets.filter((d) => d.id !== id));
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setConfirmId(null);
    }
  };

  const onSync = async (ds: DatasetListItem) => {
    if (!ds.folder_id) {
      onError('This dataset was created from a manual list and cannot be re-synced.');
      return;
    }
    setSyncingId(ds.id);
    try {
      const res = await fetch(`/api/admin/datasets/${ds.id}/sync`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Re-sync failed (HTTP ${res.status}).`);
      onChange(
        datasets.map((d) =>
          d.id === ds.id ? { ...d, imageCount: d.imageCount + (data.added ?? 0) } : d
        )
      );
      onInfo(`Added ${data.added} of ${data.total}.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Re-sync failed.');
    } finally {
      setSyncingId(null);
    }
  };

  // Skeleton while first load
  if (loading && datasets.length === 0) {
    return (
      <div className="border border-ink/20 rounded-sm overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-5 py-3.5 border-b border-ink/10 last:border-b-0"
          >
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 flex-1 max-w-[200px]" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-16 ml-auto" />
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (!loading && datasets.length === 0) {
    return (
      <div className="border border-dashed border-ink/25 px-8 py-14 text-center rounded-sm">
        <p className="font-display italic text-[22px] leading-[1.3] text-ink/80 mb-2">
          No datasets yet.
        </p>
        <p className="font-sans text-[14px] text-inkMuted max-w-md mx-auto">
          The shelves are bare. Begin with the first folder above — paste a
          Drive link or a manual list, and the catalogue will be drawn.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-ink/25 rounded-sm overflow-hidden bg-cardBg">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-ink/25 bg-paper/40">
              <th className="catalogue px-4 py-2.5 text-left w-16">№</th>
              <th className="catalogue px-4 py-2.5 text-left">Name</th>
              <th className="catalogue px-4 py-2.5 text-right w-24">Leaves</th>
              <th className="catalogue px-4 py-2.5 text-left w-44">Key</th>
              <th className="catalogue px-4 py-2.5 text-left w-32">Made</th>
              <th className="catalogue px-4 py-2.5 text-right w-44">Actions</th>
            </tr>
          </thead>
          <tbody>
            {datasets.map((d, i) => {
              const isConfirming = confirmId === d.id;
              const isSyncing = syncingId === d.id;
              return (
                <motion.tr
                  key={d.id}
                  initial={reduce ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: Math.min(i * 0.04, 0.32), ease: [0.2, 0.7, 0.2, 1] }}
                  className={cn(
                    'group border-b border-ink/10 last:border-b-0 transition-colors',
                    'hover:bg-olive/[0.04]'
                  )}
                >
                  <td className="px-4 py-3.5 align-top">
                    <span className="font-mono text-[11px] text-inkMuted">
                      {String(i + 1).padStart(3, '0')}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 align-top">
                    <Link
                      href={`/admin/datasets/${d.id}`}
                      prefetch={false}
                      className="font-display text-[16px] leading-snug text-ink hover:text-vermilion transition-colors"
                    >
                      {d.name}
                    </Link>
                    <p className="font-mono text-[10px] text-inkMuted mt-0.5 truncate max-w-[280px]">
                      {d.drive_url === 'manual' ? '— manual list —' : d.drive_url}
                    </p>
                  </td>
                  <td className="px-4 py-3.5 align-top text-right">
                    <span className="font-mono text-[14px] text-ink tabular-nums">
                      {d.imageCount.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 align-top">
                    <div className="inline-flex items-center gap-1.5">
                      <span className="font-mono text-[13px] text-ink tracking-wide">
                        {d.access_key}
                      </span>
                      <button
                        onClick={() => onCopyClick(d.access_key)}
                        className="inline-flex items-center justify-center w-7 h-7 text-inkMuted hover:text-ink transition-colors"
                        aria-label={`Copy key ${d.access_key}`}
                        title="Copy key"
                      >
                        <Copy size={13} strokeWidth={1.5} />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 align-top">
                    <span className="font-mono text-[11px] text-inkMuted">
                      {dateFmt.format(new Date(d.created_at))}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 align-top">
                    <AnimatePresence mode="wait" initial={false}>
                      {isConfirming ? (
                        <ConfirmStrip
                          key="confirm"
                          onYes={() => onDelete(d.id)}
                          onNo={() => setConfirmId(null)}
                        />
                      ) : (
                        <motion.div
                          key="actions"
                          initial={reduce ? false : { opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={reduce ? { opacity: 0 } : { opacity: 0 }}
                          transition={{ duration: 0.12 }}
                          className="flex items-center justify-end gap-1"
                        >
                          <Link
                            href={`/admin/datasets/${d.id}`}
                            prefetch={false}
                            className="inline-flex items-center gap-1.5 h-8 px-2.5 border border-transparent hover:border-ink/30 rounded-sm font-mono text-[11px] uppercase tracking-widerish text-inkMuted hover:text-ink transition-colors"
                            aria-label={`Open ${d.name}`}
                          >
                            <FolderInput size={13} strokeWidth={1.5} />
                            Open
                          </Link>
                          <IconAction
                            onClick={() => onSync(d)}
                            disabled={isSyncing}
                            label={`Re-sync ${d.name} from Drive`}
                          >
                            <RefreshCw
                              size={13}
                              strokeWidth={1.5}
                              className={isSyncing ? 'animate-spin' : ''}
                            />
                          </IconAction>
                          <IconAction
                            onClick={() => setConfirmId(d.id)}
                            label={`Delete ${d.name}`}
                            tone="danger"
                          >
                            <Trash2 size={13} strokeWidth={1.5} />
                          </IconAction>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Action components                                                         */
/* -------------------------------------------------------------------------- */

function IconAction({
  onClick, disabled, label, tone = 'neutral', children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  tone?: 'neutral' | 'danger';
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center w-8 h-8 border border-transparent rounded-sm',
        'transition-colors',
        tone === 'danger'
          ? 'text-inkMuted hover:text-vermilion hover:border-vermilion/40'
          : 'text-inkMuted hover:text-ink hover:border-ink/30',
        disabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      {children}
    </button>
  );
}

function ConfirmStrip({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  const reduce = useReducedMotion();
  const yesRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    yesRef.current?.focus();
  }, []);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onNo();
    if (e.key === 'Enter') onYes();
  };

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, x: 4 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: 4 }}
      transition={{ duration: 0.14 }}
      onKeyDown={onKey}
      className="flex items-center justify-end gap-1.5"
    >
      <span className="catalogue text-vermilion mr-1">Delete?</span>
      <button
        ref={yesRef}
        onClick={onYes}
        className="inline-flex items-center gap-1 h-7 px-2 border border-vermilion/60 text-vermilion hover:bg-vermilion hover:text-paper font-mono text-[11px] uppercase tracking-widerish rounded-sm transition-colors"
      >
        <Check size={11} strokeWidth={2} />
        Yes
      </button>
      <button
        onClick={onNo}
        className="inline-flex items-center gap-1 h-7 px-2 border border-ink/30 text-ink hover:bg-ink/5 font-mono text-[11px] uppercase tracking-widerish rounded-sm transition-colors"
      >
        <X size={11} strokeWidth={2} />
        No
      </button>
    </motion.div>
  );
}
