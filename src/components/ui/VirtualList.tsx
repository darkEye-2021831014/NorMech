'use client';

import { useEffect, useRef, useState, ReactNode, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface VirtualListProps<T> {
  items: T[];
  /** px per row. */
  rowHeight: number;
  /** Renders the row's content. Wrapper padding/border is added. */
  renderRow: (item: T, index: number) => ReactNode;
  /** Key extractor. */
  getKey: (item: T, index: number) => string;
  /** Container className. */
  className?: string;
  /** Number of rows to render above/below the visible window. */
  overscan?: number;
  /** Loading state — shows a skeleton overlay. */
  loading?: boolean;
  /** Empty state. */
  emptyState?: ReactNode;
}

/**
 * A tiny windowed list with no dependencies. Renders only the rows
 * that are currently in view (plus an overscan), which lets us ship
 * a 1000+ row drawer without paying for 1000 DOM nodes.
 */
export function VirtualList<T>({
  items,
  rowHeight,
  renderRow,
  getKey,
  className,
  overscan = 8,
  loading,
  emptyState,
}: VirtualListProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const onScroll = useCallback(() => {
    if (scrollRef.current) {
      setScrollTop(scrollRef.current.scrollTop);
    }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportHeight(el.clientHeight);
    const ro = new ResizeObserver(() => {
      setViewportHeight(el.clientHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const total = items.length;
  const totalHeight = total * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    total,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan
  );
  const visible = items.slice(startIndex, endIndex);

  if (loading && total === 0) {
    return <div className={cn('w-full', className)}>{emptyState}</div>;
  }

  if (total === 0) {
    return <div className={cn('w-full', className)}>{emptyState}</div>;
  }

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className={cn('w-full overflow-y-auto', className)}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visible.map((item, i) => {
          const realIndex = startIndex + i;
          return (
            <div
              key={getKey(item, realIndex)}
              style={{
                position: 'absolute',
                top: realIndex * rowHeight,
                left: 0,
                right: 0,
                height: rowHeight,
              }}
            >
              {renderRow(item, realIndex)}
            </div>
          );
        })}
      </div>
    </div>
  );
}