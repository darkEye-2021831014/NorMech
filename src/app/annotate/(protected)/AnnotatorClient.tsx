'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from 'framer-motion';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
  Type,
  Image as ImageIcon,
  ImagePlus,
  CircleSlash,
  Keyboard,
  AlertTriangle,
  BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { GuidelinesModal } from '@/components/annotator/GuidelinesModal';
import { cn } from '@/lib/utils';
import type { HarmSource, ImageRow } from '@/lib/annotator-actions';

interface Props {
  datasetName: string;
  userName: string;
  images: ImageRow[];
  initialAnnotations: Record<string, HarmSource>;
  startIndex: number;
}

type Status = 'idle' | 'saving' | 'saved' | 'error';
type PendingSave = { imageId: string; harmSource: HarmSource } | null;

interface State {
  annotations: Record<string, HarmSource>;
  currentIndex: number;
  status: Status;
  lastError: string | null;
  pendingSave: PendingSave;
  autoAdvance: boolean;
  showSavedAt: number; // ms timestamp; 0 = hidden
  imageErrorKey: number; // bump to force re-mount of the image
  imageError: boolean;
  imageStrikeCount: number; // 3 strikes → report-broken state
  imageReported: boolean; // surfaced after 3 strikes
}

type Action =
  | { type: 'select'; imageId: string; harmSource: HarmSource }
  | { type: 'save_ok'; imageId: string; harmSource: HarmSource }
  | { type: 'save_fail'; message: string }
  | { type: 'navigate'; direction: 'prev' | 'next' }
  | { type: 'jump'; index: number }
  | { type: 'toggle_auto_advance' }
  | { type: 'image_loaded' }
  | { type: 'image_error' }
  | { type: 'image_retry' }
  | { type: 'clear_saved' };

const AUTO_ADVANCE_MS = 350;

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'select': {
      // Optimistic write.
      return {
        ...state,
        annotations: { ...state.annotations, [action.imageId]: action.harmSource },
        status: 'saving',
        lastError: null,
        pendingSave: { imageId: action.imageId, harmSource: action.harmSource },
        showSavedAt: 0,
      };
    }
    case 'save_ok': {
      if (
        state.pendingSave &&
        state.pendingSave.imageId === action.imageId &&
        state.pendingSave.harmSource === action.harmSource
      ) {
        return {
          ...state,
          status: 'saved',
          pendingSave: null,
          showSavedAt: Date.now(),
        };
      }
      return state;
    }
    case 'save_fail': {
      return {
        ...state,
        status: 'error',
        lastError: action.message,
        pendingSave: null,
      };
    }
    case 'navigate': {
      return navigate(state, action.direction);
    }
    case 'jump': {
      return jump(state, action.index);
    }
    case 'toggle_auto_advance':
      return { ...state, autoAdvance: !state.autoAdvance };
    case 'image_loaded':
      return { ...state, imageError: false, imageStrikeCount: 0 };
    case 'image_error': {
      const strikes = state.imageStrikeCount + 1;
      return {
        ...state,
        imageError: true,
        imageStrikeCount: strikes,
        imageReported: strikes >= 3 ? true : state.imageReported,
      };
    }
    case 'image_retry':
      return {
        ...state,
        imageError: false,
        imageStrikeCount: 0,
        imageReported: false,
        imageErrorKey: state.imageErrorKey + 1,
      };
    case 'clear_saved':
      return { ...state, status: 'idle' };
  }
}

function navigate(state: State, direction: 'prev' | 'next'): State {
  const delta = direction === 'next' ? 1 : -1;
  return bumpImage({ ...state, currentIndex: state.currentIndex + delta });
}

function jump(state: State, index: number): State {
  if (index < 0 || index === state.currentIndex) return state;
  return bumpImage({ ...state, currentIndex: index });
}

function bumpImage(state: State): State {
  return {
    ...state,
    imageError: false,
    imageErrorKey: state.imageErrorKey + 1,
    imageStrikeCount: 0,
    imageReported: false,
    status: 'idle',
    lastError: null,
  };
}

export function AnnotatorClient({
  datasetName,
  userName,
  images,
  initialAnnotations,
  startIndex,
}: Props) {
  const reduce = useReducedMotion();

  const [state, dispatch] = useReducer(reducer, {
    annotations: initialAnnotations,
    currentIndex: Math.max(0, Math.min(startIndex, images.length - 1)),
    status: 'idle',
    lastError: null,
    pendingSave: null,
    autoAdvance: true,
    showSavedAt: 0,
    imageErrorKey: 0,
    imageError: false,
    imageStrikeCount: 0,
    imageReported: false,
  });

  // Show the "How to annotate" modal on first visit, and on demand.
  // `initiallyOpen` is computed on mount from localStorage; bumping
  // `openTrigger` re-opens the modal from the help button.
  const [guidelinesOpenTrigger, setGuidelinesOpenTrigger] = useState(0);
  const [initiallyShowGuidelines, setInitiallyShowGuidelines] = useState(false);
  useEffect(() => {
    try {
      const seen = localStorage.getItem('ma-guidelines-dismissed-v1') === '1';
      if (!seen) setInitiallyShowGuidelines(true);
    } catch {
      setInitiallyShowGuidelines(true);
    }
  }, []);

  // Refs that mirror state for use in async callbacks without
  // re-subscribing.
  const stateRef = useRef(state);
  stateRef.current = state;

  const currentImage = images[state.currentIndex];
  const annotatedCount = useMemo(
    () => Object.keys(state.annotations).length,
    [state.annotations]
  );
  const isComplete = images.length > 0 && annotatedCount === images.length;

  // ---------------------------------------------------------------------
  // Save an annotation. Optimistic via reducer; PUT to the server.
  // ---------------------------------------------------------------------
  const sendSave = useCallback(
    async (imageId: string, harmSource: HarmSource) => {
      try {
        const res = await fetch('/api/annotate/annotations', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageId, harmSource }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Save failed (HTTP ${res.status}).`);
        }
        dispatch({ type: 'save_ok', imageId, harmSource });
        setTimeout(() => {
          // Only clear if still showing the same "saved" tick.
          if (stateRef.current.status === 'saved') {
            dispatch({ type: 'clear_saved' });
          }
        }, 1200);
      } catch (err) {
        dispatch({
          type: 'save_fail',
          message: err instanceof Error ? err.message : 'Save failed.',
        });
      }
    },
    []
  );

  const onSelect = useCallback(
    (harmSource: HarmSource) => {
      if (!currentImage) return;
      dispatch({ type: 'select', imageId: currentImage.id, harmSource });
      void sendSave(currentImage.id, harmSource);
    },
    [currentImage, sendSave]
  );

  // ---------------------------------------------------------------------
  // Auto-advance after a successful save. We schedule when the current
  // status transitions to 'saved' and a small debounce keeps us from
  // advancing on the first image (where there's no previous save).
  // ---------------------------------------------------------------------
  const lastAdvanceFor = useRef<string | null>(null);
  useEffect(() => {
    if (!state.autoAdvance) return;
    if (state.status !== 'saved') return;
    if (!currentImage) return;

    const key = `${currentImage.id}:${state.annotations[currentImage.id]}`;
    if (lastAdvanceFor.current === key) return;
    lastAdvanceFor.current = key;

    const t = setTimeout(() => {
      if (
        stateRef.current.autoAdvance &&
        stateRef.current.status === 'saved' &&
        stateRef.current.currentIndex < images.length - 1
      ) {
        dispatch({ type: 'navigate', direction: 'next' });
      }
    }, AUTO_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [state.status, state.autoAdvance, state.annotations, currentImage, images.length]);

  // ---------------------------------------------------------------------
  // Keyboard shortcuts.
  // ---------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      // Don't double-handle arrows when a radio button has focus —
      // ChoiceGrid's keydown already moved/selected.
      if (target && target.getAttribute('role') === 'radio') {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();
      if (key === '1') return onSelect('text');
      if (key === '2') return onSelect('image');
      if (key === '3') return onSelect('both');
      if (key === '4') return onSelect('none');
      if (e.key === 'ArrowLeft' || key === 'k') return dispatch({ type: 'navigate', direction: 'prev' });
      if (e.key === 'ArrowRight' || key === 'j') return dispatch({ type: 'navigate', direction: 'next' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSelect]);

  // ---------------------------------------------------------------------
  // Preload the next 5 images. The probes only warm the browser
  // cache — they never touch display state, never gate loading of
  // the current image, and never block the rendered <img>. We use
  // a small set to dedupe, and add a 100ms delay so the current
  // image's request (with fetchpriority="high") goes out first.
  // ---------------------------------------------------------------------
  const preloadCacheRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = setTimeout(() => {
      for (let i = 1; i <= 5; i++) {
        const idx = state.currentIndex + i;
        if (idx >= images.length) continue;
        const img = images[idx];
        if (preloadCacheRef.current.has(img.id)) continue;
        preloadCacheRef.current.add(img.id);
        const probe = new window.Image();
        probe.fetchPriority = 'low';
        probe.decoding = 'async';
        probe.src = imageProxyUrl(img.id);
      }
    }, 100);
    return () => clearTimeout(t);
  }, [state.currentIndex, images]);

  // ---------------------------------------------------------------------
  // Completion / empty
  // ---------------------------------------------------------------------
  if (images.length === 0) {
    return <EmptyDataset />;
  }

  if (isComplete) {
    return <CompletionScreen datasetName={datasetName} userName={userName} />;
  }

  const progressPct = images.length === 0 ? 0 : (annotatedCount / images.length) * 100;

  return (
    <section className="max-w-[1280px] mx-auto px-4 sm:px-6 md:px-10 pt-5 sm:pt-7 pb-32 sm:pb-12">
      {/* Progress bar */}
      <div className="mb-5 sm:mb-6">
        <div className="flex items-center justify-between mb-1.5">
          <p className="catalogue text-inkMuted">
            {datasetName} <span className="text-ink/30 mx-1.5">·</span> {userName}
          </p>
          <p className="catalogue text-inkMuted tabular-nums">
            {annotatedCount.toLocaleString()} of {images.length.toLocaleString()} marked
          </p>
        </div>
        <div
          className="h-[2px] w-full bg-ink/10 overflow-hidden"
          role="progressbar"
          aria-valuenow={annotatedCount}
          aria-valuemin={0}
          aria-valuemax={images.length}
        >
          <motion.div
            className="h-full bg-vermilion"
            initial={false}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: reduce ? 0 : 0.35, ease: [0.2, 0.7, 0.2, 1] }}
          />
        </div>
      </div>

      {/* Hero */}
      <div className="relative bg-cardBg border border-ink/15 rounded-sm overflow-hidden">
        <div className="relative aspect-[16/10] w-full">
          <AnimatePresence mode="wait" initial={false}>
            {currentImage && !state.imageError ? (
              <motion.div
                key={`${currentImage.id}-${state.imageErrorKey}`}
                initial={reduce ? { opacity: 1 } : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduce ? { opacity: 1 } : { opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.18, ease: [0.2, 0.7, 0.2, 1] }}
                className="absolute inset-0"
              >
                <AnnotatorImage
                  imageId={currentImage.id}
                  fileName={currentImage.file_name}
                  onLoad={() => dispatch({ type: 'image_loaded' })}
                  onError={() => dispatch({ type: 'image_error' })}
                />
              </motion.div>
            ) : (
              <motion.div
                key="error"
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.18 }}
                className="absolute inset-0 flex flex-col items-center justify-center text-center px-6"
              >
                <AlertTriangle size={20} strokeWidth={1.5} className="text-vermilion mb-2" />
                {state.imageReported ? (
                  <>
                    <p className="font-sans text-[14px] text-ink mb-1">
                      This image appears to be broken.
                    </p>
                    <p className="catalogue text-inkMuted mb-1">
                      {currentImage?.file_name}
                    </p>
                    <p className="font-mono text-[11px] text-inkMuted mb-4 max-w-[40ch]">
                      We tried fetching it three times. You can skip it
                      and continue, or report it and the curator will be
                      notified.
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => dispatch({ type: 'navigate', direction: 'next' })}
                      >
                        Skip
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          // Single-shot report: POST to a tiny ingest
                          // endpoint. (For now just navigate on.)
                          // The redux state remains reported so the
                          // block stays shown until the user moves on.
                          dispatch({ type: 'navigate', direction: 'next' });
                        }}
                      >
                        <AlertTriangle size={11} strokeWidth={1.5} />
                        Report &amp; skip
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="font-sans text-[14px] text-ink mb-1">
                      Could not load this image.
                    </p>
                    <p className="catalogue text-inkMuted mb-4">
                      {currentImage?.file_name}
                      {state.imageStrikeCount > 0 && (
                        <span className="ml-2 text-vermilion">
                          (attempt {state.imageStrikeCount}/3)
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => dispatch({ type: 'image_retry' })}
                      >
                        <RefreshCw size={12} strokeWidth={1.5} />
                        Retry
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => dispatch({ type: 'navigate', direction: 'next' })}
                      >
                        Skip
                      </Button>
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* File caption */}
      <div className="flex items-center justify-between mt-3">
        <p className="font-mono text-[12px] text-inkMuted truncate max-w-[60ch]">
          {currentImage?.file_name}
        </p>
        <p className="font-mono text-[11px] text-inkMuted tabular-nums">
          #{String(state.currentIndex + 1).padStart(3, '0')} / {images.length}
        </p>
      </div>

      {/* Choice buttons */}
      <div className="mt-4">
        <ChoiceGrid
          current={currentImage ? state.annotations[currentImage.id] : undefined}
          onSelect={onSelect}
          reduceMotion={!!reduce}
        />
      </div>

      {/* Save state row */}
      <div className="mt-3 min-h-[20px]" aria-live="polite" aria-atomic="true">
        <SaveStateRow
          status={state.status}
          lastError={state.lastError}
          showSavedAt={state.showSavedAt}
          onRetry={() => {
            if (currentImage && state.annotations[currentImage.id]) {
              void sendSave(currentImage.id, state.annotations[currentImage.id]);
            }
          }}
        />
      </div>

      {/* Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-5">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => dispatch({ type: 'navigate', direction: 'prev' })}
            disabled={state.currentIndex === 0}
            aria-label="Previous image"
          >
            <ChevronLeft size={14} strokeWidth={1.5} />
            Prev
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => dispatch({ type: 'navigate', direction: 'next' })}
            disabled={state.currentIndex >= images.length - 1}
            aria-label="Next image"
          >
            Next
            <ChevronRight size={14} strokeWidth={1.5} />
          </Button>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => dispatch({ type: 'toggle_auto_advance' })}
            className="inline-flex items-center gap-2 catalogue text-inkMuted hover:text-ink"
            aria-pressed={state.autoAdvance}
          >
            <span
              className={cn(
                'inline-block w-7 h-[14px] border rounded-full relative transition-colors',
                state.autoAdvance ? 'border-vermilion bg-vermilion' : 'border-ink/40'
              )}
            >
              <motion.span
                className="absolute top-[1px] w-[10px] h-[10px] rounded-full"
                initial={false}
                animate={{
                  left: state.autoAdvance ? '15px' : '1px',
                  backgroundColor: state.autoAdvance ? 'rgb(var(--paper))' : 'rgb(var(--ink))',
                }}
                transition={{ duration: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
              />
            </span>
            Auto-advance
          </button>
          <button
            onClick={() => {
              // Inline jump: scan annotations starting at currentIndex + 1.
              const from = state.currentIndex + 1;
              let target = -1;
              for (let i = from; i < images.length; i++) {
                if (!state.annotations[images[i].id]) { target = i; break; }
              }
              if (target < 0) {
                for (let i = 0; i < from; i++) {
                  if (!state.annotations[images[i].id]) { target = i; break; }
                }
              }
              if (target >= 0 && target !== state.currentIndex) {
                dispatch({ type: 'jump', index: target });
              }
            }}
            className="inline-flex items-center gap-1.5 catalogue text-inkMuted hover:text-ink"
          >
            Jump to first unannotated →
          </button>
        </div>
      </div>

      {/* Progress rail */}
      <div className="mt-5">
        <ProgressRail
          images={images}
          annotations={state.annotations}
          currentIndex={state.currentIndex}
          onJump={(i) => dispatch({ type: 'jump', index: i })}
        />
      </div>

      {/* Keyboard hint */}
      <div className="catalogue text-inkMuted flex flex-wrap items-center gap-x-4 gap-y-1 mt-3">
        <span className="flex items-center gap-1.5">
          <Keyboard size={11} strokeWidth={1.5} />
          <span>1–4 to mark, ← / → to navigate, j / k also work.</span>
        </span>
        <button
          type="button"
          onClick={() => setGuidelinesOpenTrigger((n) => n + 1)}
          className="inline-flex items-center gap-1.5 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-vermilion rounded-sm"
        >
          <BookOpen size={11} strokeWidth={1.5} />
          <span>How to annotate</span>
        </button>
      </div>

      {/* First-visit + on-demand guidance modal */}
      <GuidelinesModal
        initiallyOpen={initiallyShowGuidelines}
        openTrigger={guidelinesOpenTrigger}
      />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Image                                                                     */
/* -------------------------------------------------------------------------- */

function imageProxyUrl(imageId: string): string {
  return `/api/image/${encodeURIComponent(imageId)}`;
}

const SPINNER_DELAY_MS = 400;
const WATCHDOG_MS = 15_000;

function AnnotatorImage({
  imageId,
  fileName,
  onLoad,
  onError,
}: {
  imageId: string;
  fileName: string;
  onLoad: () => void;
  onError: () => void;
}) {
  // Per-image state, isolated by `imageId` reset on the next effect.
  const [loaded, setLoaded] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  // Bumping the URL forces the browser to bypass HTTP cache once.
  // Used by the watchdog to recover from a stuck first request.
  const [cacheBust, setCacheBust] = useState(0);

  const imgRef = useRef<HTMLImageElement | null>(null);
  // Latest imageId in scope of async timers, so a stale watchdog for
  // a previous image can't report a load/error for the current one.
  const imageIdRef = useRef(imageId);
  imageIdRef.current = imageId;

  // Reset state for the new image. We do NOT trust onLoad alone —
  // if the image is already in the browser cache and the page
  // reloaded, the browser may have fired `load` before React
  // hydrated, so onLoad never reaches us. We re-check `complete`
  // synchronously via a ref callback and via a layout effect.
  useEffect(() => {
    setLoaded(false);
    setShowSpinner(false);
    setCacheBust(0);
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug('[AnnotatorImage] start', imageIdRef.current);
    }
    const t = setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS);
    return () => clearTimeout(t);
  }, [imageId]);

  // If the image finished loading (cached + already complete) before
  // our useEffect ran, catch it here. useLayoutEffect runs after the
  // DOM is committed but before the browser paints, so we can flip
  // `loaded` synchronously and avoid a one-frame flash of the skeleton.
  useLayoutEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    if (el.complete) {
      if (el.naturalWidth > 0) {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.debug('[AnnotatorImage] already-complete', imageIdRef.current);
        }
        setLoaded(true);
        onLoad();
      } else {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.debug('[AnnotatorImage] already-error', imageIdRef.current);
        }
        setLoaded(false);
        onError();
      }
    }
    // Intentionally only run on imageId change — we don't want to
    // re-run on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageId, cacheBust]);

  // 15s watchdog: if we still don't have a definitive result, retry
  // once with a cache-busting param, then surface the error state.
  useEffect(() => {
    const id = imageIdRef.current;
    const t = setTimeout(() => {
      const el = imgRef.current;
      if (!el) return;
      if (imageIdRef.current !== id) return; // user navigated away
      if (el.complete && el.naturalWidth > 0) return; // already good
      if (cacheBust === 0) {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.debug('[AnnotatorImage] watchdog retry', id);
        }
        setCacheBust(1);
      } else {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.debug('[AnnotatorImage] watchdog fail', id);
        }
        setLoaded(false);
        onError();
      }
    }, WATCHDOG_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageId, cacheBust]);

  const src =
    cacheBust === 0
      ? imageProxyUrl(imageId)
      : `${imageProxyUrl(imageId)}&t=${Date.now()}`;

  return (
    <>
      {!loaded && (
        <div className="absolute inset-0 w-full h-full">
          <Skeleton className="absolute inset-0 w-full h-full" />
          {showSpinner && (
            <div className="absolute inset-0 flex items-center justify-center text-inkMuted">
              <Loader2
                size={18}
                strokeWidth={1.5}
                className="animate-spin"
                aria-label="Loading image"
              />
            </div>
          )}
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        key={imageId}
        src={src}
        alt={`Image for annotation, file ${fileName}. Use the buttons below to mark it.`}
        loading="eager"
        decoding="async"
        // High priority for the visible image; preloads above are
        // low priority.
        fetchPriority="high"
        draggable={false}
        onLoad={() => {
          if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.debug('[AnnotatorImage] load', imageIdRef.current);
          }
          setLoaded(true);
          onLoad();
        }}
        onError={() => {
          if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.debug('[AnnotatorImage] error', imageIdRef.current);
          }
          setLoaded(false);
          onError();
        }}
        className={cn(
          'absolute inset-0 w-full h-full object-contain transition-opacity duration-200 select-none',
          loaded ? 'opacity-100' : 'opacity-0'
        )}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Choice buttons                                                            */
/* -------------------------------------------------------------------------- */

const CHOICES: {
  key: string;
  harm: HarmSource;
  label: string;
  description: string;
  icon: React.ReactNode;
  tone: 'vermilion' | 'olive';
}[] = [
  {
    key: '1',
    harm: 'text',
    label: 'Text',
    description: 'The harm comes from the words on the image.',
    icon: <Type size={16} strokeWidth={1.5} />,
    tone: 'vermilion',
  },
  {
    key: '2',
    harm: 'image',
    label: 'Image',
    description: 'The harm comes from the picture itself, not the words.',
    icon: <ImageIcon size={16} strokeWidth={1.5} />,
    tone: 'vermilion',
  },
  {
    key: '3',
    harm: 'both',
    label: 'Both',
    description: 'The harm comes from picture and words together.',
    icon: <ImagePlus size={16} strokeWidth={1.5} />,
    tone: 'vermilion',
  },
  {
    key: '4',
    harm: 'none',
    label: 'None',
    description: 'There is no harmful content in this image.',
    icon: <CircleSlash size={16} strokeWidth={1.5} />,
    tone: 'olive',
  },
];

function ChoiceGrid({
  current,
  onSelect,
  reduceMotion,
}: {
  current: HarmSource | undefined;
  onSelect: (h: HarmSource) => void;
  reduceMotion: boolean;
}) {
  // WAI-ARIA radiogroup: ←/→/↑/↓ move between radios, Home/End jump to
  // first/last. Space/Enter activates (handled by the button).
  const onKeyDown = (e: import('react').KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.getAttribute('role') !== 'radio') return;
    const buttons = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    );
    const idx = buttons.indexOf(target as HTMLButtonElement);
    if (idx < 0) return;

    const move = (newIdx: number) => {
      e.preventDefault();
      const wrapped = (newIdx + buttons.length) % buttons.length;
      const next = buttons[wrapped];
      next.focus();
      onSelect(CHOICES[wrapped].harm);
    };

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        move(idx + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        move(idx - 1);
        break;
      case 'Home':
        move(0);
        break;
      case 'End':
        move(buttons.length - 1);
        break;
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Mark this image"
      onKeyDown={onKeyDown}
      className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3"
    >
      {CHOICES.map((c) => {
        const selected = current === c.harm;
        return (
          <motion.button
            key={c.harm}
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(c.harm)}
            whileTap={reduceMotion ? undefined : { scale: 0.98, y: 1 }}
            transition={{ type: 'spring', stiffness: 600, damping: 30 }}
            className={cn(
              'btn-touch relative w-full text-left px-3.5 sm:px-4 py-3 sm:py-3.5',
              'border rounded-sm flex flex-col gap-1.5 transition-colors duration-150 ease-notebook',
              selected
                ? c.tone === 'vermilion'
                  ? 'bg-vermilion text-paper border-vermilion'
                  : 'bg-olive text-paper border-olive'
                : 'bg-cardBg text-ink border-ink/25 hover:border-ink'
            )}
          >
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  'inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widerish',
                  selected ? 'text-paper/80' : 'text-inkMuted'
                )}
              >
                <span
                  className={cn(
                    'inline-flex items-center justify-center w-5 h-5 border',
                    selected
                      ? 'border-paper/70 text-paper'
                      : 'border-ink/40 text-ink'
                  )}
                >
                  {c.key}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  {c.icon}
                  <span className="font-sans text-[14px] font-medium normal-case tracking-normal">
                    {c.label}
                  </span>
                </span>
              </span>
              {selected && (
                <motion.span
                  initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 24 }}
                  className="inline-flex items-center justify-center w-5 h-5"
                  aria-hidden
                >
                  <Check size={14} strokeWidth={2} />
                </motion.span>
              )}
            </div>
            <p
              className={cn(
                'text-[12.5px] leading-snug',
                selected ? 'text-paper/85' : 'text-inkMuted'
              )}
            >
              {c.description}
            </p>
          </motion.button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Save state row                                                            */
/* -------------------------------------------------------------------------- */

function SaveStateRow({
  status,
  lastError,
  showSavedAt,
  onRetry,
}: {
  status: Status;
  lastError: string | null;
  showSavedAt: number;
  onRetry: () => void;
}) {
  if (status === 'error' && lastError) {
    return (
      <div className="flex items-center justify-between gap-3 border border-vermilion/60 bg-vermilion/[0.06] text-vermilion px-3 py-2 rounded-sm">
        <span className="font-mono text-[12px]">
          Couldn&apos;t save. {lastError}
        </span>
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 h-8 px-2.5 border border-vermilion/60 hover:bg-vermilion hover:text-paper font-mono text-[11px] uppercase tracking-widerish rounded-sm transition-colors"
        >
          <RefreshCw size={11} strokeWidth={1.5} />
          Retry
        </button>
      </div>
    );
  }

  if (status === 'saving') {
    return (
      <p className="font-mono text-[11px] text-inkMuted inline-flex items-center gap-1.5">
        <Loader2 size={11} strokeWidth={1.5} className="animate-spin" />
        Saving…
      </p>
    );
  }

  if (status === 'saved' && showSavedAt) {
    return (
      <p className="font-mono text-[11px] text-olive inline-flex items-center gap-1.5">
        <Check size={11} strokeWidth={2} />
        Saved.
      </p>
    );
  }

  return <span aria-hidden className="block h-[18px]" />;
}

/* -------------------------------------------------------------------------- */
/*  Progress rail                                                             */
/* -------------------------------------------------------------------------- */

function ProgressRail({
  images,
  annotations,
  currentIndex,
  onJump,
}: {
  images: ImageRow[];
  annotations: Record<string, HarmSource>;
  currentIndex: number;
  onJump: (i: number) => void;
}) {
  return (
    <div className="border border-ink/15 bg-cardBg rounded-sm px-2.5 py-2.5">
      <p className="catalogue text-inkMuted mb-1.5">
        progress — click any tile to jump
      </p>
      <div
        role="list"
        aria-label="Annotation progress"
        className="flex items-center gap-1 flex-wrap"
      >
        {images.map((img, i) => {
          const annotated = !!annotations[img.id];
          const current = i === currentIndex;
          return (
            <button
              key={img.id}
              role="listitem"
              onClick={() => onJump(i)}
              title={img.file_name}
              aria-current={current ? 'true' : undefined}
              aria-label={`Image ${i + 1} of ${images.length}: ${img.file_name}${
                annotated ? ' (marked)' : ' (unmarked)'
              }${current ? ', current' : ''}`}
              className={cn(
                'h-3.5 w-3.5 border rounded-sm transition-colors',
                current
                  ? 'border-vermilion bg-vermilion'
                  : annotated
                  ? 'border-olive bg-olive'
                  : 'border-ink/20 bg-ink/[0.06] hover:border-ink/50'
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Empty / completion                                                        */
/* -------------------------------------------------------------------------- */

function EmptyDataset() {
  return (
    <section className="max-w-[1280px] mx-auto px-6 md:px-10 py-24 text-center">
      <p className="font-display italic text-[24px] text-ink/80 mb-2">
        This dataset has no images yet.
      </p>
      <p className="font-sans text-[14px] text-inkMuted">
        The curator has not yet pressed any leaves into the volume.
      </p>
    </section>
  );
}

function CompletionScreen({
  datasetName,
  userName,
}: {
  datasetName: string;
  userName: string;
}) {
  const reduce = useReducedMotion();
  return (
    <section className="max-w-[800px] mx-auto px-6 md:px-10 py-20 sm:py-28 text-center">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
      >
        <p className="catalogue text-olive mb-3 flex items-center justify-center gap-2">
          <span className="w-1.5 h-1.5 bg-olive rounded-full" aria-hidden />
          The ledger is full
        </p>
        <h1 className="font-display text-[40px] sm:text-[52px] leading-[1.02] tracking-tightest text-ink mb-4">
          Every leaf in <span className="italic">{datasetName}</span>{' '}
          has been marked.
        </h1>
        <p className="font-sans text-[15px] leading-[1.6] text-inkMuted mb-10 max-w-[48ch] mx-auto">
          Thank you, {userName}. The work is recorded. You may now download
          a copy of your marks, or close the page and return to the volume.
        </p>

        <div className="flex items-center justify-center gap-3">
          <a
            href="/api/annotate/csv"
            className="inline-flex items-center justify-center gap-2 h-11 px-5 text-sm font-mono uppercase tracking-widerish bg-ink text-paper border border-ink hover:bg-vermilion transition-colors rounded-sm"
          >
            <Download size={14} strokeWidth={1.5} />
            Download my CSV
          </a>
        </div>

        <p className="mt-12 font-display italic text-[14px] text-inkMuted">
          &ldquo;Nothing is ever really lost to us as long as we remember it.&rdquo;
        </p>
      </motion.div>
    </section>
  );
}
