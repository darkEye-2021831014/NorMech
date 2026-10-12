'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  Copy,
  Check,
  X,
  Download,
  Trash2,
  Eye,
  FileDown,
  FileArchive,
  Archive,
  Search,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { CountUp } from '@/components/ui/CountUp';
import { cn } from '@/lib/utils';
import type { DatasetOverview, UserStats } from '@/lib/admin-actions';
import { AnnotationsDrawer } from './AnnotationsDrawer';

interface Props {
  datasetId: string;
  datasetName: string;
  accessKey: string;
  createdAt: string;
  imageCount: number;
  users: UserStats[];
  overview: DatasetOverview;
}

const HARM_META: Record<string, { label: string; tone: 'vermilion' | 'olive' | 'neutral' }> = {
  text: { label: 'Text', tone: 'vermilion' },
  image: { label: 'Image', tone: 'vermilion' },
  both: { label: 'Both', tone: 'vermilion' },
  none: { label: 'None', tone: 'olive' },
};

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const dayFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
});

export function DatasetDetailClient({
  datasetId,
  datasetName,
  accessKey,
  createdAt,
  imageCount,
  users: initialUsers,
  overview: initialOverview,
}: Props) {
  const reduce = useReducedMotion();
  const { push } = useToast();
  const [users, setUsers] = useState<UserStats[]>(initialUsers);
  const [overview, setOverview] = useState<DatasetOverview>(initialOverview);
  const [refreshing, setRefreshing] = useState(false);
  const [includeEmpty, setIncludeEmpty] = useState(false);
  const [drawerUser, setDrawerUser] = useState<UserStats | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UserStats | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/admin/datasets/${datasetId}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Refresh failed (HTTP ${res.status}).`);
      const data = await res.json();
      setUsers(data.detail.users);
      setOverview(data.detail.overview);
    } catch (e) {
      push('error', e instanceof Error ? e.message : 'Refresh failed.');
    } finally {
      setRefreshing(false);
    }
  }, [datasetId, push]);

  const onCopyKey = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(accessKey);
      push('success', `Copied ${accessKey}.`);
    } catch {
      push('error', 'Could not copy to clipboard.');
    }
  }, [accessKey, push]);

  const onDeleteUser = useCallback(
    async (u: UserStats) => {
      try {
        const res = await fetch(`/api/admin/users/${u.id}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Delete failed (HTTP ${res.status}).`);
        }
        setUsers((all) => all.filter((x) => x.id !== u.id));
        push('success', `Removed “${u.name}” and their ${u.annotatedCount} marks.`);
      } catch (e) {
        push('error', e instanceof Error ? e.message : 'Delete failed.');
      } finally {
        setConfirmDelete(null);
      }
    },
    [push]
  );

  return (
    <section className="max-w-[1280px] mx-auto px-6 md:px-10 pt-10 md:pt-12 pb-24">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/admin"
          prefetch={false}
          className="inline-flex items-center gap-1.5 catalogue text-inkMuted hover:text-ink mb-4"
        >
          <ArrowLeft size={12} strokeWidth={1.5} />
          Back to the index
        </Link>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="catalogue text-inkMuted mb-2">The reader&apos;s volume</p>
            <h1 className="font-display text-[34px] sm:text-[42px] leading-[1.02] tracking-tightest text-ink">
              {datasetName}
            </h1>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-3">
              <div className="inline-flex items-center gap-1.5">
                <span className="catalogue text-inkMuted">Key</span>
                <span className="font-mono text-[14px] text-ink tracking-wide">
                  {accessKey}
                </span>
                <button
                  onClick={onCopyKey}
                  className="inline-flex items-center justify-center w-7 h-7 text-inkMuted hover:text-ink"
                  aria-label={`Copy key ${accessKey}`}
                  title="Copy key"
                >
                  <Copy size={13} strokeWidth={1.5} />
                </button>
              </div>
              <span className="catalogue text-inkMuted">
                <span className="text-ink font-mono text-[13px]">
                  {imageCount.toLocaleString()}
                </span>{' '}
                leaves
              </span>
              <span className="catalogue text-inkMuted">
                Made {dateFmt.format(new Date(createdAt))}
              </span>
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="btn-touch inline-flex items-center gap-1.5 catalogue text-inkMuted hover:text-ink self-start md:self-end"
          >
            <Loader2
              size={12}
              strokeWidth={1.5}
              className={cn(refreshing && 'animate-spin')}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* Overview strip */}
      <OverviewStrip overview={overview} />

      {/* Export bar */}
      <div className="mt-8 mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="catalogue text-vermilion flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-vermilion rounded-full" aria-hidden />
          § — Readers
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-widerish text-inkMuted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeEmpty}
              onChange={(e) => setIncludeEmpty(e.target.checked)}
              className="appearance-none w-4 h-4 border border-ink/40 rounded-sm checked:bg-ink checked:border-ink transition-colors cursor-pointer"
            />
            Include unannotated rows
          </label>
          <a
            href={`/api/admin/datasets/${datasetId}/csv?includeEmpty=${includeEmpty ? 1 : 0}`}
            className="inline-flex items-center gap-1.5 h-9 px-3 border border-ink/30 hover:border-ink text-ink font-mono text-[11px] uppercase tracking-widerish rounded-sm transition-colors"
          >
            <FileDown size={12} strokeWidth={1.5} />
            Combined CSV
          </a>
          <a
            href={`/api/admin/datasets/${datasetId}/zip?includeEmpty=${includeEmpty ? 1 : 0}`}
            className="inline-flex items-center gap-1.5 h-9 px-3 border border-ink/30 hover:border-ink text-ink font-mono text-[11px] uppercase tracking-widerish rounded-sm transition-colors"
          >
            <FileArchive size={12} strokeWidth={1.5} />
            ZIP of CSVs
          </a>
        </div>
      </div>

      {/* Users table */}
      <UsersTable
        users={users}
        datasetId={datasetId}
        onView={(u) => setDrawerUser(u)}
        onDelete={(u) => setConfirmDelete(u)}
        onCopied={(m) => push('success', m)}
        onError={(m) => push('error', m)}
      />

      {/* Delete confirm modal */}
      <AnimatePresence>
        {confirmDelete && (
          <ConfirmModal
            key="delete"
            title={`Remove “${confirmDelete.name}”?`}
            body={
              <>
                Their <strong>{confirmDelete.annotatedCount}</strong> mark
                {confirmDelete.annotatedCount === 1 ? '' : 's'} will be erased. The
                dataset, its images, and other readers are unaffected.
              </>
            }
            confirmLabel="Remove reader"
            onYes={() => onDeleteUser(confirmDelete)}
            onNo={() => setConfirmDelete(null)}
          />
        )}
      </AnimatePresence>

      {/* Drawer */}
      <AnimatePresence>
        {drawerUser && (
          <AnnotationsDrawer
            key={drawerUser.id}
            datasetId={datasetId}
            userId={drawerUser.id}
            userName={drawerUser.name}
            imageCount={imageCount}
            onClose={() => setDrawerUser(null)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Overview strip                                                            */
/* -------------------------------------------------------------------------- */

function OverviewStrip({ overview }: { overview: DatasetOverview }) {
  const reduce = useReducedMotion();
  const total =
    overview.distribution.text +
    overview.distribution.image +
    overview.distribution.both +
    overview.distribution.none;
  const segs = [
    { key: 'text', value: overview.distribution.text, fillClass: 'bg-vermilion' },
    { key: 'image', value: overview.distribution.image, fillClass: 'bg-vermilion/70' },
    { key: 'both', value: overview.distribution.both, fillClass: 'bg-vermilion/40' },
    { key: 'none', value: overview.distribution.none, fillClass: 'bg-olive' },
  ];

  return (
    <div className="border border-ink/20 bg-cardBg rounded-sm">
      <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-ink/10">
        <Stat
          label="Readers"
          value={overview.totalUsers}
        />
        <Stat
          label="Marks made"
          value={overview.totalAnnotations}
        />
        <Stat
          label="Completion"
          value={overview.completionPct}
          format={(n) => `${n.toFixed(n < 10 ? 1 : 0)}%`}
          hint={
            overview.totalSlots === 0
              ? '— no slots —'
              : `${overview.totalAnnotations.toLocaleString()} / ${overview.totalSlots.toLocaleString()}`
          }
        />
        <Stat
          label="Last mark"
          value={overview.lastActivityAt ? new Date(overview.lastActivityAt).getTime() : 0}
          format={(n) =>
            overview.lastActivityAt
              ? dayFmt.format(new Date(n))
              : '—'
          }
        />
      </div>

      <div className="px-5 py-4 border-t border-ink/10">
        <div className="flex items-center justify-between mb-2">
          <p className="catalogue text-inkMuted">Distribution of marks</p>
          <p className="catalogue text-inkMuted tabular-nums">
            {total.toLocaleString()} total
          </p>
        </div>
        {total === 0 ? (
          <div className="h-3 w-full bg-ink/8 rounded-sm" />
        ) : (
          <>
            <div className="flex h-3 w-full overflow-hidden rounded-sm border border-ink/15">
              {segs.map((s) => {
                if (s.value === 0) return null;
                const pct = (s.value / total) * 100;
                return (
                  <motion.div
                    key={s.key}
                    initial={reduce ? false : { width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: reduce ? 0 : 0.5, ease: [0.2, 0.7, 0.2, 1] }}
                    className={cn('h-full', s.fillClass)}
                    title={`${s.key}: ${s.value} (${pct.toFixed(1)}%)`}
                    aria-label={`${s.key} ${s.value}`}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5">
              {(['text', 'image', 'both', 'none'] as const).map((k) => {
                const meta = HARM_META[k];
                const v = overview.distribution[k];
                return (
                  <div
                    key={k}
                    className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widerish"
                  >
                    <span
                      className={cn(
                        'inline-block w-2 h-2 rounded-sm',
                        k === 'none' ? 'bg-olive' : 'bg-vermilion',
                        k === 'image' && 'opacity-70',
                        k === 'both' && 'opacity-40'
                      )}
                    />
                    <span className="text-inkMuted">{meta.label}</span>
                    <span className="text-ink tabular-nums">{v.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  format,
  hint,
}: {
  label: string;
  value: number;
  format?: (n: number) => string;
  hint?: string;
}) {
  return (
    <div className="px-5 py-4">
      <p className="catalogue text-inkMuted mb-1">{label}</p>
      <p className="font-display text-[26px] sm:text-[30px] leading-none tracking-tightest text-ink">
        <CountUp to={value} format={format} durationMs={650} />
      </p>
      {hint && <p className="mt-1.5 font-mono text-[10px] text-inkMuted">{hint}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Users table                                                               */
/* -------------------------------------------------------------------------- */

function UsersTable({
  users,
  datasetId,
  onView,
  onDelete,
  onCopied,
  onError,
}: {
  users: UserStats[];
  datasetId: string;
  onView: (u: UserStats) => void;
  onDelete: (u: UserStats) => void;
  onCopied: (m: string) => void;
  onError: (m: string) => void;
}) {
  const reduce = useReducedMotion();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);

  if (users.length === 0) {
    return (
      <div className="border border-dashed border-ink/25 px-8 py-14 text-center rounded-sm">
        <p className="font-display italic text-[22px] leading-[1.3] text-ink/80 mb-2">
          No readers yet.
        </p>
        <p className="font-sans text-[14px] text-inkMuted max-w-md mx-auto">
          Share the access key to invite a reader. They will appear here once
          they sign in for the first time.
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
              <th className="catalogue px-4 py-2.5 text-left">Reader</th>
              <th className="catalogue px-4 py-2.5 text-left w-72">Progress</th>
              <th className="catalogue px-4 py-2.5 text-left w-40">Last mark</th>
              <th className="catalogue px-4 py-2.5 text-right w-72">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => {
              const pct =
                u.totalCount === 0
                  ? 0
                  : Math.min(100, (u.annotatedCount / u.totalCount) * 100);
              const isConfirming = confirmId === u.id;
              return (
                <motion.tr
                  key={u.id}
                  initial={reduce ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.22,
                    delay: Math.min(i * 0.03, 0.32),
                    ease: [0.2, 0.7, 0.2, 1],
                  }}
                  className="group border-b border-ink/10 last:border-b-0 hover:bg-olive/[0.04] transition-colors"
                >
                  <td className="px-4 py-3.5 align-top">
                    <span className="font-mono text-[11px] text-inkMuted">
                      {String(i + 1).padStart(3, '0')}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 align-top">
                    <p className="font-display text-[16px] leading-snug text-ink">
                      {u.name}
                    </p>
                    <p className="font-mono text-[10px] text-inkMuted mt-0.5">
                      Since {dayFmt.format(new Date(u.createdAt))}
                    </p>
                  </td>
                  <td className="px-4 py-3.5 align-top">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-[3px] bg-ink/10 rounded-full overflow-hidden">
                        <motion.div
                          initial={reduce ? false : { width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{
                            duration: reduce ? 0 : 0.4,
                            ease: [0.2, 0.7, 0.2, 1],
                          }}
                          className={cn(
                            'h-full rounded-full',
                            pct >= 100 ? 'bg-olive' : 'bg-vermilion'
                          )}
                        />
                      </div>
                      <span className="font-mono text-[12px] text-ink tabular-nums whitespace-nowrap">
                        {u.annotatedCount.toLocaleString()} / {u.totalCount.toLocaleString()}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 align-top">
                    <span className="font-mono text-[11px] text-inkMuted">
                      {u.lastActivityAt
                        ? relativeTime(new Date(u.lastActivityAt))
                        : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 align-top">
                    <AnimatePresence mode="wait" initial={false}>
                      {isConfirming ? (
                        <ConfirmStrip
                          key="confirm"
                          onYes={() => {
                            onDelete(u);
                            setConfirmId(null);
                          }}
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
                          <ActionLink
                            onClick={() => onView(u)}
                            label={`View ${u.name}'s marks`}
                          >
                            <Eye size={13} strokeWidth={1.5} />
                            View
                          </ActionLink>
                          <ActionLink
                            href={`/api/admin/users/${u.id}/csv?datasetId=${datasetId}`}
                            label={`Download ${u.name}'s CSV`}
                          >
                            <Download size={13} strokeWidth={1.5} />
                            CSV
                          </ActionLink>
                          <ActionLink
                            onClick={async () => {
                              const url = `${window.location.origin}/api/admin/users/${u.id}/csv?datasetId=${datasetId}`;
                              try {
                                await navigator.clipboard.writeText(url);
                                onCopied(`Link copied for ${u.name}.`);
                                setCopiedUserId(u.id);
                                setTimeout(
                                  () =>
                                    setCopiedUserId((id) => (id === u.id ? null : id)),
                                  1500
                                );
                              } catch {
                                onError('Could not copy link.');
                              }
                            }}
                            label={`Copy ${u.name}'s CSV download link`}
                            tone="info"
                          >
                            {copiedUserId === u.id ? (
                              <Check size={13} strokeWidth={1.5} />
                            ) : (
                              <Copy size={13} strokeWidth={1.5} />
                            )}
                          </ActionLink>
                          <IconAction
                            onClick={() => setConfirmId(u.id)}
                            label={`Remove ${u.name}`}
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
/*  Small action primitives                                                   */
/* -------------------------------------------------------------------------- */

function ActionLink({
  href,
  onClick,
  label,
  tone = 'neutral',
  children,
}: {
  href?: string;
  onClick?: () => void;
  label: string;
  tone?: 'neutral' | 'danger' | 'info';
  children: React.ReactNode;
}) {
  const cls = cn(
    'inline-flex items-center gap-1.5 h-8 px-2.5 border border-transparent rounded-sm',
    'font-mono text-[11px] uppercase tracking-widerish transition-colors',
    tone === 'danger'
      ? 'text-inkMuted hover:text-vermilion hover:border-vermilion/40'
      : tone === 'info'
      ? 'text-inkMuted hover:text-ink hover:border-ink/30'
      : 'text-ink hover:border-ink/40 hover:bg-ink/5'
  );
  if (href) {
    return (
      <a href={href} className={cls} aria-label={label} title={label}>
        {children}
      </a>
    );
  }
  return (
    <button onClick={onClick} className={cls} aria-label={label} title={label}>
      {children}
    </button>
  );
}

function IconAction({
  onClick,
  label,
  tone = 'neutral',
  children,
}: {
  onClick: () => void;
  label: string;
  tone?: 'neutral' | 'danger';
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center w-8 h-8 border border-transparent rounded-sm',
        'transition-colors',
        tone === 'danger'
          ? 'text-inkMuted hover:text-vermilion hover:border-vermilion/40'
          : 'text-inkMuted hover:text-ink hover:border-ink/30'
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

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, x: 4 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: 4 }}
      transition={{ duration: 0.14 }}
      className="flex items-center justify-end gap-1.5"
    >
      <span className="catalogue text-vermilion mr-1">Remove?</span>
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

function ConfirmModal({
  title,
  body,
  confirmLabel,
  onYes,
  onNo,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  onYes: () => void;
  onNo: () => void;
}) {
  const reduce = useReducedMotion();
  const yesRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    yesRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onNo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNo]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        onClick={onNo}
        aria-hidden
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        initial={reduce ? false : { opacity: 0, y: 8, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.99 }}
        transition={{ duration: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
        className="relative w-full max-w-md bg-cardBg border border-ink/30 rounded-sm p-6 shadow-2xl"
      >
        <p className="catalogue text-vermilion mb-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-vermilion rounded-full" aria-hidden />
          Destructive
        </p>
        <h2 className="font-display text-[24px] leading-snug tracking-tightest text-ink mb-2">
          {title}
        </h2>
        <p className="font-sans text-[14px] leading-[1.6] text-inkMuted mb-6">
          {body}
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onNo}>
            Cancel
          </Button>
          <Button
            ref={yesRef}
            variant="danger"
            size="sm"
            onClick={onYes}
          >
            <Trash2 size={12} strokeWidth={1.5} />
            {confirmLabel}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Utilities                                                                 */
/* -------------------------------------------------------------------------- */

function relativeTime(d: Date): string {
  const now = Date.now();
  const diffMs = now - d.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return dayFmt.format(d);
}