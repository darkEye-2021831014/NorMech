'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Search, X, ImageIcon, Filter, Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { VirtualList } from '@/components/ui/VirtualList';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import type { HarmSource } from '@/lib/annotator-actions';

interface AnnotationItem {
  imageId: string;
  fileId: string;
  fileName: string;
  position: number;
  harmSource: HarmSource | null;
  updatedAt: string | null;
}

interface AnnotationsResponse {
  items: AnnotationItem[];
  total: number;
  page: number;
  pageSize: number;
}

interface Props {
  datasetId: string;
  userId: string;
  userName: string;
  imageCount: number;
  onClose: () => void;
}

type Filter = 'all' | 'unannotated' | HarmSource;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unannotated', label: 'Unmarked' },
  { value: 'text', label: 'Text' },
  { value: 'image', label: 'Image' },
  { value: 'both', label: 'Both' },
  { value: 'none', label: 'None' },
];

const HARM_META: Record<HarmSource, { label: string; tone: 'vermilion' | 'olive' }> = {
  text: { label: 'Text', tone: 'vermilion' },
  image: { label: 'Image', tone: 'vermilion' },
  both: { label: 'Both', tone: 'vermilion' },
  none: { label: 'None', tone: 'olive' },
};

const PAGE_SIZE = 500;
const ROW_HEIGHT = 64; // px

export function AnnotationsDrawer({
  datasetId,
  userId,
  userName,
  imageCount,
  onClose,
}: Props) {
  const reduce = useReducedMotion();
  const { push } = useToast();

  const [filter, setFilter] = useState<Filter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState(''); // debounced
  const [items, setItems] = useState<AnnotationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Debounce the search input — 220ms feels right for a name filter.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 220);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset when the user / dataset / filter changes.
  useEffect(() => {
    setItems([]);
    setPage(1);
    setHasMore(false);
  }, [datasetId, userId, filter, search]);

  // Fetch the current page.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const url = new URL(
      `/api/admin/users/${userId}/annotations`,
      window.location.origin
    );
    url.searchParams.set('datasetId', datasetId);
    url.searchParams.set('filter', filter);
    url.searchParams.set('page', String(page));
    url.searchParams.set('pageSize', String(PAGE_SIZE));
    if (search) url.searchParams.set('q', search);

    fetch(url.toString(), { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        return (await res.json()) as AnnotationsResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setTotal(data.total);
        setHasMore(data.items.length < data.total ? false : data.page * data.pageSize < data.total);
        if (data.page === 1) {
          setItems(data.items);
        } else {
          setItems((prev) => [...prev, ...data.items]);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [datasetId, userId, filter, search, page]);

  // Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const downloadCsv = () => {
    window.location.href = `/api/admin/users/${userId}/csv?datasetId=${datasetId}`;
  };

  const annotatedCount = useMemo(
    () => items.filter((i) => i.harmSource !== null).length,
    [items]
  );

  return (
    <motion.div
      className="fixed inset-0 z-40"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0 }}
      transition={{ duration: 0.15 }}
      role="dialog"
      aria-modal="true"
      aria-label={`Marks by ${userName}`}
    >
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <motion.aside
        initial={reduce ? false : { x: '100%' }}
        animate={{ x: 0 }}
        exit={reduce ? { opacity: 0 } : { x: '100%' }}
        transition={{ duration: 0.24, ease: [0.2, 0.7, 0.2, 1] }}
        className={cn(
          'absolute right-0 top-0 h-full w-full sm:w-[640px] md:w-[720px]',
          'bg-cardBg border-l border-ink/30 flex flex-col shadow-2xl'
        )}
      >
        {/* Drawer header */}
        <header className="px-5 sm:px-7 py-5 border-b border-ink/15">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="catalogue text-vermilion mb-1 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-vermilion rounded-full" aria-hidden />
                Marks
              </p>
              <h2 className="font-display text-[24px] sm:text-[28px] leading-tight tracking-tightest text-ink">
                {userName}
              </h2>
              <p className="font-mono text-[11px] text-inkMuted mt-1">
                {annotatedCount} of {total.toLocaleString()} shown
                {search && ` · matching “${search}”`}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={downloadCsv}
                aria-label={`Download ${userName}'s CSV`}
              >
                <Download size={12} strokeWidth={1.5} />
                CSV
              </Button>
              <button
                onClick={onClose}
                aria-label="Close drawer"
                className="inline-flex items-center justify-center w-9 h-9 text-inkMuted hover:text-ink border border-transparent hover:border-ink/30 rounded-sm transition-colors"
              >
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <Filter size={12} strokeWidth={1.5} className="text-inkMuted mr-1" />
            {FILTERS.map((f) => {
              const active = filter === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex items-center h-7 px-2.5 rounded-sm',
                    'font-mono text-[10.5px] uppercase tracking-widerish border transition-colors',
                    active
                      ? 'bg-ink text-paper border-ink'
                      : 'bg-transparent text-inkMuted border-ink/25 hover:border-ink/60 hover:text-ink'
                  )}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="mt-3 relative">
            <Search
              size={12}
              strokeWidth={1.5}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-inkMuted"
            />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by file name…"
              className={cn(
                'w-full h-9 pl-7 pr-3 text-[13px] font-mono text-ink bg-paper',
                'border border-ink/25 rounded-sm outline-none',
                'focus:border-ink placeholder:text-inkMuted/60'
              )}
            />
          </div>
        </header>

        {/* List */}
        <div className="flex-1 min-h-0">
          {error ? (
            <ErrorState message={error} />
          ) : (
            <VirtualList
              items={items}
              rowHeight={ROW_HEIGHT}
              getKey={(it) => it.imageId}
              className="h-full"
              loading={loading && items.length === 0}
              emptyState={
                loading ? (
                  <div className="p-3 space-y-1">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-[60px] w-full" />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    filter={filter}
                    hasSearch={!!search}
                    onClearSearch={() => setSearchInput('')}
                    onResetFilter={() => setFilter('all')}
                  />
                )
              }
              renderRow={(item) => <Row item={item} />}
            />
          )}
        </div>

        {/* Footer / pagination */}
        <footer className="px-5 sm:px-7 py-3 border-t border-ink/15 flex items-center justify-between">
          <p className="font-mono text-[11px] text-inkMuted">
            {loading
              ? 'Loading…'
              : `Showing ${items.length.toLocaleString()} of ${total.toLocaleString()}`}
          </p>
          {hasMore && !loading && (
            <Button variant="secondary" size="sm" onClick={() => setPage((p) => p + 1)}>
              Load more
            </Button>
          )}
        </footer>
      </motion.aside>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Row                                                                       */
/* -------------------------------------------------------------------------- */

function Row({ item }: { item: AnnotationItem }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className={cn(
        'h-full px-5 sm:px-7 flex items-center gap-3 border-b border-ink/8',
        'hover:bg-olive/[0.04] transition-colors'
      )}
    >
      {/* Thumbnail */}
      <div className="relative w-12 h-12 flex-shrink-0 bg-paper border border-ink/20 rounded-sm overflow-hidden">
        {!imgLoaded && !imgError && (
          <Skeleton className="absolute inset-0 w-full h-full" />
        )}
        {imgError ? (
          <div className="absolute inset-0 flex items-center justify-center text-inkMuted">
            <ImageIcon size={14} strokeWidth={1.5} />
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/image/${item.imageId}`}
            alt={item.fileName}
            loading="lazy"
            decoding="async"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
            className={cn(
              'absolute inset-0 w-full h-full object-cover transition-opacity duration-200',
              imgLoaded ? 'opacity-100' : 'opacity-0'
            )}
          />
        )}
      </div>

      {/* File name + position */}
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[12.5px] text-ink truncate" title={item.fileName}>
          {item.fileName}
        </p>
        <p className="font-mono text-[10px] text-inkMuted mt-0.5 tabular-nums">
          #{String(item.position + 1).padStart(4, '0')} of {item.fileId ? '' : ''}
        </p>
      </div>

      {/* Badge */}
      {item.harmSource ? (
        <Badge tone={HARM_META[item.harmSource].tone}>
          {HARM_META[item.harmSource].label}
        </Badge>
      ) : (
        <span className="inline-flex items-center h-6 px-2 text-[10px] font-mono uppercase tracking-widerish text-inkMuted border border-dashed border-ink/30 rounded-sm">
          Unmarked
        </span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Empty / error                                                             */
/* -------------------------------------------------------------------------- */

function EmptyState({
  filter,
  hasSearch,
  onClearSearch,
  onResetFilter,
}: {
  filter: Filter;
  hasSearch: boolean;
  onClearSearch: () => void;
  onResetFilter: () => void;
}) {
  return (
    <div className="px-7 py-16 text-center">
      <p className="font-display italic text-[20px] text-ink/80 mb-2">
        {hasSearch
          ? 'No file names match that search.'
          : filter === 'unannotated'
          ? 'Every leaf has been marked.'
          : 'Nothing to show.'}
      </p>
      <p className="font-sans text-[13px] text-inkMuted mb-5 max-w-sm mx-auto">
        {hasSearch
          ? 'Try a shorter or different substring.'
          : 'Try a different filter.'}
      </p>
      <div className="flex items-center justify-center gap-2">
        {hasSearch && (
          <Button variant="secondary" size="sm" onClick={onClearSearch}>
            Clear search
          </Button>
        )}
        {filter !== 'all' && (
          <Button variant="secondary" size="sm" onClick={onResetFilter}>
            All leaves
          </Button>
        )}
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="px-7 py-12 text-center">
      <p className="catalogue text-vermilion mb-2">Couldn&apos;t load</p>
      <p className="font-sans text-[14px] text-inkMuted">{message}</p>
    </div>
  );
}