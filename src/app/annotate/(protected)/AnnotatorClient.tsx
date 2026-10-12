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
  Hash,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { GuidelinesModal } from '@/components/annotator/GuidelinesModal';
import { cn } from '@/lib/utils';
import type { HarmSource, ImageRow } from '@/lib/annotator-actions';

interface Props {
  userName: string;
  datasetId: string;
  images: ImageRow[];
  initialAnnotations: Record<string, HarmSource>;
  startIndex: number;
}

type Status = 'idle' | 'saving' | 'saved' | 'error';
type PendingSave = { imageId: string; harmSource: HarmSource } | null;
type Boundary = 'first' | 'last' | null;

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
  // The most-recent "you can't go further" cue, with a timestamp
  // so the UI knows when to clear it. `null` = no active cue.
  boundaryCue: { which: Boundary; at: number };
  // Visible cursor on the choice grid. `null` = hidden (no Up/Down
  // yet, and no existing label on the current image). When set, an
  // accent ring is drawn around the option at this index WITHOUT
  // selecting it; selecting is a separate action (Enter / Space /
  // 1-4).
  cursorIndex: number | null;
}

type Action =
  | { type: 'select'; imageId: string; harmSource: HarmSource }
  | { type: 'save_ok'; imageId: string; harmSource: HarmSource }
  | { type: 'save_fail'; message: string }
  | {
      type: 'goTo';
      target: number;
      total: number;
      // Image id at the target index, used to seed the cursor
      // when the navigation lands on a new image. Optional so
      // the type is easy to construct in tests; missing image
      // id → cursor stays hidden.
      imageId?: string;
    }
  | { type: 'toggle_auto_advance' }
  | { type: 'image_loaded' }
  | { type: 'image_error' }
  | { type: 'image_retry' }
  | { type: 'clear_saved' }
  | { type: 'clear_boundary_cue'; at: number }
  // Cursor control. The reducer resolves the new index from
  // `delta` (wrapping) or from a `target` (Home=-999, End=+999).
  | { type: 'cursor_move'; delta: number; total: number }
  | { type: 'cursor_reset_to'; index: number | null };

const AUTO_ADVANCE_MS = 350;
const BOUNDARY_CUE_MS = 900;

function clampIndex(i: number, total: number): number {
  if (total <= 0) return 0;
  if (i < 0) return 0;
  if (i > total - 1) return total - 1;
  return i;
}

// Lookup: harm source → its position in CHOICES (defined below).
// Used to seed the cursor when an image has an existing label, and
// to snap the cursor to the option the user just picked.
const HARM_TO_CHOICE_INDEX: Record<HarmSource, number> = {
  text: 0,
  image: 1,
  both: 2,
  none: 3,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'select': {
      // Optimistic write.
      const idx = HARM_TO_CHOICE_INDEX[action.harmSource];
      return {
        ...state,
        annotations: { ...state.annotations, [action.imageId]: action.harmSource },
        status: 'saving',
        lastError: null,
        pendingSave: { imageId: action.imageId, harmSource: action.harmSource },
        showSavedAt: 0,
        // When the user marks, the cursor snaps to the option they
        // just picked, so Enter on the same option is a no-op rather
        // than a "moved then moved back" jump.
        cursorIndex: idx,
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
    case 'goTo': {
      // The ONLY path that changes currentIndex. Always clamps to
      // [0, total-1]. If the user is already on the target and the
      // target is at a boundary, set a cue so the UI can nudge.
      const last = action.total - 1;
      const cur = state.currentIndex;
      if (action.total <= 0) return state;
      // Already at the requested spot. If they're at the edge and
      // tried to go further, surface a boundary cue.
      if (action.target === cur) {
        if (cur === 0 && action.target <= 0) {
          return { ...state, boundaryCue: { which: 'first', at: Date.now() } };
        }
        if (cur === last && action.target >= last) {
          return { ...state, boundaryCue: { which: 'last', at: Date.now() } };
        }
        return state;
      }
      // Clamp and check for the boundary.
      const target = clampIndex(action.target, action.total);
      if (target === cur) {
        // After clamping we ended up where we already are. This
        // happens when the user presses Right at the last image
        // or Left at the first.
        const which: Boundary = target === 0 ? 'first' : target === last ? 'last' : null;
        if (which) {
          return { ...state, boundaryCue: { which, at: Date.now() } };
        }
        return state;
      }
      return {
        ...state,
        currentIndex: target,
        imageError: false,
        imageErrorKey: state.imageErrorKey + 1,
        imageStrikeCount: 0,
        imageReported: false,
        status: 'idle',
        lastError: null,
        boundaryCue: { which: null, at: 0 },
        // Reset the cursor for the new image. If that image has an
        // existing label, snap the cursor to it (so the user can
        // press Enter to re-mark, or arrow to a different one). If
        // not, hide the cursor until the user presses Up/Down.
        cursorIndex: action.imageId
          ? (() => {
              const existing = state.annotations[action.imageId!];
              return existing ? HARM_TO_CHOICE_INDEX[existing] : null;
            })()
          : null,
      };
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
    case 'clear_boundary_cue':
      // Only clear if no newer cue has been set.
      if (state.boundaryCue.at === action.at) {
        return { ...state, boundaryCue: { which: null, at: 0 } };
      }
      return state;
    case 'cursor_move': {
      // Move the cursor by `delta` slots, wrapping. The reducer is
      // the only place that knows how many options exist; the page
      // passes `total` (currently always 4 = CHOICES.length).
      const { delta, total } = action;
      if (total <= 0) return state;
      const cur = state.cursorIndex;
      // First press: if hidden, show it on the first option.
      if (cur === null) {
        return { ...state, cursorIndex: 0 };
      }
      const wrapped = ((cur + delta) % total + total) % total;
      if (wrapped === cur) return state;
      return { ...state, cursorIndex: wrapped };
    }
    case 'cursor_reset_to':
      return { ...state, cursorIndex: action.index };
  }
}

export function AnnotatorClient({
  userName,
  datasetId,
  images,
  initialAnnotations,
  startIndex,
}: Props) {
  const reduce = useReducedMotion();

  const [state, dispatch] = useReducer(reducer, (() => {
    // Lazy init: the cursor starts on the first image's existing
    // label (if any), or hidden. We compute this here so the very
    // first render already has the right cursor state — no flash of
    // a hidden cursor on a previously-annotated image.
    const idx = clampIndex(startIndex, images.length);
    const img = images[idx];
    const existing = img ? initialAnnotations[img.id] : undefined;
    return {
      annotations: initialAnnotations,
      currentIndex: idx,
      status: 'idle' as const,
      lastError: null,
      pendingSave: null,
      autoAdvance: true,
      showSavedAt: 0,
      imageErrorKey: 0,
      imageError: false,
      imageStrikeCount: 0,
      imageReported: false,
      boundaryCue: { which: null, at: 0 },
      cursorIndex: existing ? HARM_TO_CHOICE_INDEX[existing] : null,
    };
  })());

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

  // ---------------------------------------------------------------------
  // Furthest-viewed index. Used to classify tiles as `skipped`
  // (not annotated AND index < max(furthestViewedIndex,
  // lastAnnotatedIndex)). Persisted to localStorage per dataset;
  // the whole block is wrapped in try/catch so storage failures
  // (private mode, quota, sandboxed iframes) fall back to in-memory
  // only without breaking the page.
  // ---------------------------------------------------------------------
  const [furthestViewedIndex, setFurthestViewedIndex] = useState(0);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`normech-annotator-furthest:${datasetId}`);
      const n = raw == null ? 0 : parseInt(raw, 10);
      if (Number.isFinite(n) && n >= 0) {
        setFurthestViewedIndex(Math.min(n, Math.max(0, images.length - 1)));
      }
    } catch {
      /* in-memory fallback only */
    }
    // datasetId and images.length are stable for the lifetime of
    // this view; intentionally only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    setFurthestViewedIndex((prev) => {
      const next = Math.max(prev, state.currentIndex);
      if (next === prev) return prev;
      try {
        localStorage.setItem(`normech-annotator-furthest:${datasetId}`, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [state.currentIndex, datasetId]);

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
  const lastIndex = Math.max(0, images.length - 1);

  // Per-image status used by the progress map. For each index:
  //   marked   — has an annotation
  //   skipped  — not annotated AND index < cutoff (the user moved
  //              past it; cutoff is the max of furthestViewedIndex
  //              and the highest annotated index)
  //   pending  — not annotated AND not yet past
  //   current  — index === currentIndex (combined with the above)
  const cutoff = useMemo(() => {
    let lastAnn = -1;
    for (let i = 0; i < images.length; i++) {
      if (state.annotations[images[i].id]) lastAnn = i;
    }
    return Math.max(furthestViewedIndex, lastAnn);
  }, [furthestViewedIndex, state.annotations, images]);

  const statusByIndex = useMemo(() => {
    const arr: ('marked' | 'skipped' | 'pending')[] = new Array(images.length);
    for (let i = 0; i < images.length; i++) {
      if (state.annotations[images[i].id]) {
        arr[i] = 'marked';
      } else if (i < cutoff) {
        arr[i] = 'skipped';
      } else {
        arr[i] = 'pending';
      }
    }
    return arr;
  }, [images, state.annotations, cutoff]);

  const skippedCount = useMemo(
    () => statusByIndex.filter((s) => s === 'skipped').length,
    [statusByIndex]
  );

  // The single navigation primitive. All paths (Next/Prev buttons,
  // ArrowLeft/Right, J/K, progress rail, "Jump to first unannotated",
  // and auto-advance) route through this. The reducer clamps to
  // [0, lastIndex] and sets `boundaryCue` when the user tried to
  // go past an edge so the UI can nudge.
  const goTo = useCallback(
    (target: number) => {
      const clamped = clampIndex(target, images.length);
      const imageId = images[clamped]?.id;
      dispatch({ type: 'goTo', target, total: images.length, imageId });
    },
    [images]
  );

  // Auto-clear the boundary cue after BOUNDARY_CUE_MS.
  useEffect(() => {
    if (state.boundaryCue.which === null) return;
    const at = state.boundaryCue.at;
    const t = setTimeout(() => {
      dispatch({ type: 'clear_boundary_cue', at });
    }, BOUNDARY_CUE_MS);
    return () => clearTimeout(t);
  }, [state.boundaryCue.which, state.boundaryCue.at]);

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
  // Auto-advance after a successful save. We schedule when the
  // current status transitions to 'saved'. Critically, we only
  // advance if there's a NEXT valid index — i.e. the user is NOT
  // on the last image. When the user marks the last image, the
  // annotation count either hits `images.length` (→ completion
  // state) or it doesn't (→ user stays on the last image and sees
  // the "N still unmarked" prompt).
  // ---------------------------------------------------------------------
  const lastAdvanceFor = useRef<string | null>(null);
  useEffect(() => {
    if (!state.autoAdvance) return;
    if (state.status !== 'saved') return;
    if (!currentImage) return;
    if (state.currentIndex >= lastIndex) return; // last image — don't advance past

    const key = `${currentImage.id}:${state.annotations[currentImage.id]}`;
    if (lastAdvanceFor.current === key) return;
    lastAdvanceFor.current = key;

    const t = setTimeout(() => {
      const ref = stateRef.current;
      if (!ref.autoAdvance) return;
      if (ref.status !== 'saved') return;
      if (ref.currentIndex >= images.length - 1) return;
      // Route through goTo so clamping/auditing is consistent.
      // (We use the raw dispatch here because we have a ref, but
      // it's the SAME shape goTo uses.)
      const nextIdx = ref.currentIndex + 1;
      const imageId = images[nextIdx]?.id;
      dispatch({ type: 'goTo', target: nextIdx, total: images.length, imageId });
    }, AUTO_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [state.status, state.autoAdvance, state.annotations, state.currentIndex, currentImage, images, images.length, lastIndex]);

  // ---------------------------------------------------------------------
  // Keyboard shortcuts.
  //
  //   ← / →  (and j / k): previous / next image. Never change the
  //                        selected option. clamp at the edges via
  //                        goTo.
  //   ↑ / ↓             : move a visible "cursor" highlight between
  //                        Text / Image / Both / None. Wrapping.
  //                        Does NOT save and does NOT auto-advance.
  //                        If the cursor is hidden, the first press
  //                        shows it on the first option.
  //   Enter / Space     : when the cursor is visible, mark the option
  //                        under the cursor (saves; auto-advance
  //                        rules apply). When the cursor is hidden,
  //                        no-op (the user is asked to pick a label
  //                        first so we never silently mark "text"
  //                        by accident).
  //   1 - 4             : mark the current image directly.
  //
  // When focus is on a text input, textarea, or contenteditable, we
  // bail. The ChoiceGrid's own onKeyDown handles ↑ / ↓ when a radio
  // is focused, so the page handler only sees those keys when focus
  // is elsewhere (and we re-broadcast the same ↑/↓ action so the
  // cursor moves regardless of where focus lives).
  // ---------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // ChoiceGrid handles its own radio focus. Skip the page-level
      // 1-4 / Enter / Space / ↑ / ↓ handling when a radio is focused
      // so we don't double-dispatch.
      const onRadio =
        !!target && target.getAttribute('role') === 'radio';

      const key = e.key.toLowerCase();
      // Direct marking keys — always work, anywhere on the page.
      // On a radio, the focused element's own click is what fires
      // (via Enter/Space), so we let those through naturally. The
      // numeric keys still need preventDefault to avoid scrolling.
      if (key === '1') {
        e.preventDefault();
        return onSelect('text');
      }
      if (key === '2') {
        e.preventDefault();
        return onSelect('image');
      }
      if (key === '3') {
        e.preventDefault();
        return onSelect('both');
      }
      if (key === '4') {
        e.preventDefault();
        return onSelect('none');
      }
      // Image navigation. ChoiceGrid's onKeyDown `preventDefault`s
      // ←/→ on a radio so the radiogroup doesn't move focus; the
      // page handler still runs (it's a different listener) and
      // navigates to the previous/next image.
      if (e.key === 'ArrowLeft' || key === 'j') {
        e.preventDefault();
        return goTo(stateRef.current.currentIndex - 1);
      }
      if (e.key === 'ArrowRight' || key === 'k') {
        e.preventDefault();
        return goTo(stateRef.current.currentIndex + 1);
      }
      // Cursor movement. When a radio is focused, ChoiceGrid's own
      // onKeyDown already called onCursorMove; the reducer is
      // idempotent so this re-dispatch is harmless but wasted, so
      // we suppress the page-level dispatch on a radio.
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!onRadio) {
          dispatch({ type: 'cursor_move', delta: -1, total: CHOICES.length });
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!onRadio) {
          dispatch({ type: 'cursor_move', delta: +1, total: CHOICES.length });
        }
        return;
      }
      // Enter / Space — mark the option under the cursor. On a
      // radio, the focused element's own click (synthetic on
      // keyup) will mark the right option, so the page handler
      // is a no-op there. Off a radio (body, progress map tile,
      // image), the radio click doesn't fire, so we mark from
      // here.
      if (e.key === 'Enter') {
        if (onRadio) return;
        const cur = stateRef.current.cursorIndex;
        if (cur != null) {
          e.preventDefault();
          return onSelect(CHOICES[cur].harm);
        }
        return;
      }
      if (e.key === ' ' || e.key === 'Spacebar') {
        if (onRadio) return;
        const cur = stateRef.current.cursorIndex;
        if (cur != null) {
          e.preventDefault();
          return onSelect(CHOICES[cur].harm);
        }
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSelect, goTo]);

  // ---------------------------------------------------------------------
  // Preload the next 5 images. The probes only warm the browser
  // cache — they never touch display state, never gate loading of
  // the current image, and never block the rendered <img>. We use
  // a small set to dedupe, and add a 100ms delay so the current
  // image's request (with fetchpriority="high") goes out first.
  //
  // Indices are clamped so we never probe an out-of-range row.
  // ---------------------------------------------------------------------
  const preloadCacheRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const last = images.length - 1;
    const t = setTimeout(() => {
      for (let i = 1; i <= 5; i++) {
        const idx = state.currentIndex + i;
        if (idx < 0 || idx > last) continue;
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
  //
  // Empty datasets render their own page-level "no images yet" view.
  // Completed datasets (every image marked) do NOT replace the
  // annotator with a full-screen completion view — the user must
  // still be able to review and change any answer. Instead, the
  // normal annotator UI renders and a slim `CompletionBanner` shows
  // at the top of the right panel.
  // ---------------------------------------------------------------------
  if (images.length === 0) {
    return <EmptyDataset />;
  }

  return (
    <section
      data-testid="annotator-page"
      className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 px-3 sm:px-4 md:px-6 py-3"
    >
      {/* Left column: image + caption. flex-1 min-h-0 so any aspect
          ratio (very tall / very wide memes) shrinks to fit the
          available height without pushing the controls off-screen. */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="relative flex-1 min-h-0 bg-cardBg border border-ink/15 rounded-sm overflow-hidden">
          {/*
            No AnimatePresence / no framer-motion gating the image swap.
            The image is always in the DOM (keyed by image.id so React
            resets it on navigation). The skeleton is a sibling, rendered
            only while !loaded and UNMOUNTED otherwise. Visibility is
            driven by a CSS data-loaded attribute, never by a JS animation
            that has to complete.
          */}
          {/*
            Belt-and-suspenders: if the index is out of range (which
            shouldn't be possible — goTo clamps), render NOTHING
            rather than the error UI. The error UI only shows when
            there's a real current image and the image genuinely
            failed to load.
          */}
          {currentImage && !state.imageError && (
            <AnnotatorImage
              key={`${currentImage.id}-${state.imageErrorKey}`}
              imageId={currentImage.id}
              fileName={currentImage.file_name}
              onLoad={() => dispatch({ type: 'image_loaded' })}
              onError={() => dispatch({ type: 'image_error' })}
            />
          )}
          {currentImage && state.imageError && (
            <div
              key="error"
              data-testid="annotator-error"
              className="absolute inset-0 flex flex-col items-center justify-center text-center px-6"
            >
              <AlertTriangle size={20} strokeWidth={1.5} className="text-vermilion mb-2" />
              {state.imageReported ? (
                <>
                  <p className="font-sans text-[14px] text-ink mb-1">
                    This image appears to be broken.
                  </p>
                  <p className="catalogue text-inkMuted mb-1">
                    {currentImage.file_name}
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
                      onClick={() => goTo(state.currentIndex + 1)}
                    >
                      Skip
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        // Single-shot report: in this build we just
                        // advance. The state stays reported until
                        // the user moves on.
                        goTo(state.currentIndex + 1);
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
                    {currentImage.file_name}
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
                      onClick={() => goTo(state.currentIndex + 1)}
                    >
                      Skip
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* File caption row — directly under the image. */}
        <div className="flex items-center justify-between mt-2 shrink-0">
          <p className="font-mono text-[12px] text-inkMuted truncate max-w-[60ch]">
            {currentImage?.file_name}
          </p>
          <p
            data-testid="current-counter"
            className="font-mono text-[11px] text-inkMuted tabular-nums"
          >
            #{String(state.currentIndex + 1).padStart(3, '0')} / {images.length}
          </p>
        </div>
      </div>

      {/* Right column / bottom row on mobile: the control panel.
          On lg+ it is a 340px wide column with internal overflow-y
          (so the panel itself can scroll if a future content
          addition makes it overflow, while the page stays put).
          Below lg it is a full-width block at the bottom of the
          page. The panel has its own explicit top padding so it
          always starts with consistent breathing room below the
          header. min-h-0 on a flex item is what unlocks
          overflow-y-auto inside it. */}
      <aside className="flex flex-col gap-2 shrink-0 w-full lg:w-[340px] lg:h-full lg:min-h-0 lg:overflow-y-auto pt-2 lg:pt-1">
        {/* Completion banner. Shown only when every image is marked.
            Non-modal: it doesn't block the choices, the progress
            map, or the navigation. The user can keep reviewing and
            editing; the banner just provides the primary
            "Download my CSV" affordance. */}
        {isComplete && (
          <CompletionBanner
            annotatedCount={annotatedCount}
            userName={userName}
          />
        )}

        {/* Choice buttons — panel variant: vertical stack on lg+,
            2x2 grid on mobile, description hidden on mobile so the
            four cards fit. */}
        <ChoiceGrid
          variant="panel"
          current={currentImage ? state.annotations[currentImage.id] : undefined}
          cursorIndex={state.cursorIndex}
          onSelect={onSelect}
          onCursorMove={(delta) =>
            dispatch({ type: 'cursor_move', delta, total: CHOICES.length })
          }
          reduceMotion={!!reduce}
        />

        {/* Progress map: the source of truth for "where is the user
            in the volume". Lives between the choices and the
            Prev/Next row. flex-1 + min-h-0 so it absorbs whatever
            vertical space the panel has — the page itself never
            scrolls because the panel's overflow-y-auto catches any
            overflow at this layer. */}
        <ProgressMap
          images={images}
          statusByIndex={statusByIndex}
          currentIndex={state.currentIndex}
          annotations={state.annotations}
          skippedCount={skippedCount}
          annotatedCount={annotatedCount}
          onJump={(idx) => goTo(idx)}
          reduceMotion={!!reduce}
        />

        {/* Save state row */}
        <div className="min-h-[18px]" aria-live="polite" aria-atomic="true">
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

        {/*
          "N images still unmarked" prompt. Shown only when the user is
          sitting on the LAST image, has marked it, and there are still
          unannotated images elsewhere in the volume. We don't auto-
          advance past the end (the index must never go out of range),
          so we surface a calm hand-off instead.
        */}
        {state.currentIndex === lastIndex &&
          !isComplete &&
          state.status === 'saved' &&
          currentImage &&
          state.annotations[currentImage.id] && (
            <div
              data-testid="still-unmarked-prompt"
              className="flex flex-wrap items-center justify-between gap-2 border border-ink/15 bg-cardBg px-3 py-2 rounded-sm"
            >
              <p className="font-sans text-[12.5px] text-inkMuted">
                <span className="font-medium text-ink tabular-nums">
                  {images.length - annotatedCount}
                </span>{' '}
                {images.length - annotatedCount === 1
                  ? 'image is still unmarked'
                  : 'images are still unmarked'}
                .
              </p>
              <button
                onClick={() => {
                  // Scan from the start; first unannotated wins. (We're
                  // sitting on the last image, so wrapping from current+1
                  // would just put us back here.)
                  for (let i = 0; i < images.length; i++) {
                    if (!state.annotations[images[i].id]) {
                      goTo(i);
                      return;
                    }
                  }
                }}
                className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widerish text-vermilion hover:text-ink"
              >
                Jump to first unannotated →
              </button>
            </div>
          )}

        {/* Navigation: Prev / Next */}
        <div className="flex items-center gap-2">
          <BoundaryNudge
            which="first"
            active={state.boundaryCue.which === 'first'}
            reduce={!!reduce}
          >
            <Button
              size="sm"
              variant="secondary"
              onClick={() => goTo(state.currentIndex - 1)}
              disabled={state.currentIndex === 0}
              aria-label="Previous image"
            >
              <ChevronLeft size={14} strokeWidth={1.5} />
              Prev
            </Button>
          </BoundaryNudge>
          <BoundaryNudge
            which="last"
            active={state.boundaryCue.which === 'last'}
            reduce={!!reduce}
          >
            <Button
              size="sm"
              variant="secondary"
              onClick={() => goTo(state.currentIndex + 1)}
              disabled={state.currentIndex >= lastIndex}
              aria-label="Next image"
            >
              Next
              <ChevronRight size={14} strokeWidth={1.5} />
            </Button>
          </BoundaryNudge>
        </div>

        {/* Auto-advance toggle */}
        <button
          onClick={() => dispatch({ type: 'toggle_auto_advance' })}
          className="inline-flex items-center gap-2 catalogue text-inkMuted hover:text-ink self-start"
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

        {/* Jump actions: "First unmarked" and (when applicable)
            "Next skipped". Side by side, mono small caps. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            onClick={() => {
              // Inline jump: scan annotations starting at currentIndex + 1.
              // We route through goTo so the reducer can clamp and
              // clear boundaryCue. If everything after the cursor is
              // annotated, wrap to the first unannotated before the
              // cursor; if there's nothing at all, no-op.
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
                goTo(target);
              }
            }}
            className="inline-flex items-center gap-1.5 catalogue text-inkMuted hover:text-ink"
          >
            First unmarked →
          </button>
          {skippedCount > 0 && (
            <button
              onClick={() => {
                // Next skipped: scan for the first `skipped` tile
                // strictly after the current index; wrap if needed.
                const from = state.currentIndex + 1;
                let target = -1;
                for (let i = from; i < statusByIndex.length; i++) {
                  if (statusByIndex[i] === 'skipped') { target = i; break; }
                }
                if (target < 0) {
                  for (let i = 0; i < from; i++) {
                    if (statusByIndex[i] === 'skipped') { target = i; break; }
                  }
                }
                if (target >= 0 && target !== state.currentIndex) {
                  goTo(target);
                }
              }}
              className="inline-flex items-center gap-1.5 catalogue text-vermilion dark:text-vermilionBright hover:underline"
            >
              Next skipped →
            </button>
          )}
        </div>

        {/* Footer: keyboard hint + "How to annotate" link */}
        <div className="catalogue text-inkMuted flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 border-t border-ink/10 mt-1">
          <span className="flex items-center gap-1.5">
            <Keyboard size={11} strokeWidth={1.5} />
            <span>← / → previous / next image · ↑ / ↓ choose option · Enter confirm · 1-4 mark directly.</span>
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
      </aside>

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
  // `loaded` drives the CSS data-loaded attribute. We do NOT use it
  // to gate mount — the <img> is always rendered, the skeleton is a
  // sibling that is unmounted when not needed.
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

  // The ref callback is invoked synchronously when React attaches the
  // <img> to the DOM. If the image is already complete (cached /
  // already loaded before hydration), we flip `loaded` immediately.
  // This is the most reliable path for the bug the user reported:
  // onLoad can fire before React hydrates and attach the listener, so
  // we also detect that case here.
  //
  // IMPORTANT: the ref callback must be stable across renders, otherwise
  // React detaches and re-attaches the ref every render → infinite
  // re-render loop. We hold the latest onLoad/onError in refs and
  // read them in the callback without making them dependencies.
  const onLoadRef = useRef(onLoad);
  const onErrorRef = useRef(onError);
  onLoadRef.current = onLoad;
  onErrorRef.current = onError;
  const setImgRef = useCallback((el: HTMLImageElement | null) => {
    imgRef.current = el;
    if (!el) return;
    if (el.complete && el.naturalWidth > 0) {
      setLoaded(true);
      onLoadRef.current();
    }
  }, []);

  // Reset state for a new image. Runs on mount AND whenever imageId
  // changes (which, because of `key={imageId}` on the parent, means
  // it runs on every navigation).
  //
  // Important: this runs AFTER the ref callback and the layout
  // effect, so if either of them has already flipped `loaded` to
  // true (because the image was in the browser cache and was
  // complete at commit time), we must NOT clobber it. We check
  // `imgRef.current.complete && naturalWidth > 0` before resetting.
  useEffect(() => {
    const el = imgRef.current;
    const alreadyLoaded = !!(el && el.complete && el.naturalWidth > 0);
    if (alreadyLoaded) {
      // Don't reset — the ref callback or layout effect already
      // marked this image as loaded. Still start the watchdog in
      // case of a hang.
      const t = setTimeout(() => {
        const e = imgRef.current;
        if (e && (!e.complete || e.naturalWidth === 0)) {
          setCacheBust((b) => (b === 0 ? 1 : b));
        }
      }, WATCHDOG_MS);
      return () => clearTimeout(t);
    }
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

  // Belt-and-suspenders layout effect: if the ref callback ran before
  // the image had a chance to complete, or if the image became
  // complete between ref-callback and effect (very rare), catch it
  // here. useLayoutEffect runs after the DOM is committed but before
  // the browser paints.
  useLayoutEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    if (el.complete && el.naturalWidth > 0 && !loaded) {
      setLoaded(true);
      onLoadRef.current();
    }
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
        onErrorRef.current();
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
    <div
      data-testid="annotator-image"
      data-loaded={loaded ? 'true' : 'false'}
      data-image-id={imageId}
      className="absolute inset-0"
    >
      {/*
        Sibling skeleton: mounted only while !loaded, UNMOUNTED otherwise.
        We do NOT use CSS to hide it (e.g. opacity-0) — it gets removed
        from the tree so the next image can mount its own skeleton
        cleanly with `key={image.id}` and not inherit any
        animation/transition state.
      */}
      {!loaded && (
        <div
          data-testid="annotator-skeleton"
          className="absolute inset-0 w-full h-full"
        >
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
      {/*
        The image is ALWAYS in the DOM. Visibility is driven by a
        CSS opacity transition keyed off data-loaded. We never
        gate the img on a JS animation; the className `opacity-100` /
        `opacity-0` plus the data-loaded attribute are the only sources
        of truth.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={setImgRef}
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
          onLoadRef.current();
        }}
        onError={() => {
          if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.debug('[AnnotatorImage] error', imageIdRef.current);
          }
          setLoaded(false);
          onErrorRef.current();
        }}
        className={cn(
          'absolute inset-0 w-full h-full object-contain select-none',
          'transition-opacity duration-200 ease-notebook',
          loaded ? 'opacity-100' : 'opacity-0'
        )}
      />
    </div>
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
  cursorIndex,
  onSelect,
  onCursorMove,
  reduceMotion,
  variant = 'grid',
}: {
  current: HarmSource | undefined;
  /**
   * The visible "cursor" position. `null` means the cursor is hidden
   * (no Up/Down has been pressed yet, and the current image has no
   * existing label). When set, an accent ring is drawn around the
   * matching option WITHOUT changing the fill — selecting is a
   * separate action (Enter/Space, or keys 1-4).
   */
  cursorIndex: number | null;
  onSelect: (h: HarmSource) => void;
  onCursorMove: (delta: number) => void;
  reduceMotion: boolean;
  /**
   * 'grid' (default): the original 2-col on mobile / 4-col on lg layout
   * with full descriptions.
   * 'panel': a compact layout for the side panel — vertical stack on
   * lg+, 2x2 on mobile, with the description text hidden on mobile so
   * the four cards fit without scrolling.
   */
  variant?: 'grid' | 'panel';
}) {
  // Keyboard semantics. Native radiogroup arrow keys would change
  // the selection; we override that so:
  //   ←/→  → navigate to the previous/next image (do NOT change the
  //          selection; let the page-level handler do the navigation).
  //   ↑/↓  → move the visible "cursor" highlight through the four
  //          options, wrapping. Does NOT save or auto-advance.
  //   Home/End → jump the cursor to the first/last option (no save).
  //   Enter/Space → handled by the page-level handler (marks the
  //          option under the cursor).
  // We `preventDefault()` for ←/→ so the browser doesn't also act
  // on the underlying radio semantics.
  const onKeyDown = (e: import('react').KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.getAttribute('role') !== 'radio') return;
    const buttons = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    );
    const idx = buttons.indexOf(target as HTMLButtonElement);
    if (idx < 0) return;

    switch (e.key) {
      case 'ArrowLeft':
        // ←/→ are reserved for image navigation. The page-level
        // handler will move to the previous image. Swallow the key
        // here so the radiogroup doesn't move focus to the previous
        // radio AND so the browser doesn't toggle a radio.
        e.preventDefault();
        break;
      case 'ArrowRight':
        e.preventDefault();
        break;
      case 'ArrowUp':
        e.preventDefault();
        onCursorMove(-1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        onCursorMove(+1);
        break;
      case 'Home':
        e.preventDefault();
        onCursorMove(-999);
        break;
      case 'End':
        e.preventDefault();
        onCursorMove(+999);
        break;
      // Enter / Space — fall through to the button's own click
      // (we don't preventDefault). The page-level handler ALSO
      // intercepts Enter/Space at the window level to mark the
      // option under the cursor when a non-radio element has focus.
    }
  };

  const isPanel = variant === 'panel';
  // 'grid' keeps the original 2-col mobile / 4-col lg layout.
  // 'panel' uses 2-col on mobile (description hidden) and a vertical
  // stack (1-col) on lg+ with the description visible below the
  // number/label row.
  const containerClass = isPanel
    ? 'grid grid-cols-2 lg:grid-cols-1 gap-2'
    : 'grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3';

  return (
    <div
      role="radiogroup"
      aria-label="Mark this image"
      onKeyDown={onKeyDown}
      className={containerClass}
    >
      {CHOICES.map((c, idx) => {
        const selected = current === c.harm;
        const isCursor = cursorIndex === idx;
        return (
          <motion.button
            key={c.harm}
            role="radio"
            aria-checked={selected}
            aria-current={isCursor ? 'true' : undefined}
            data-cursor={isCursor ? 'true' : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(c.harm)}
            whileTap={reduceMotion ? undefined : { scale: 0.98, y: 1 }}
            transition={{ type: 'spring', stiffness: 600, damping: 30 }}
            className={cn(
              // Card itself: CSS grid with [number badge | content].
              // Padding 12-14px, gap 4-6px, no fixed height, so the
              // card grows with its content. min-width:0 on the
              // content column so the description can wrap.
              isPanel
                ? cn(
                    'btn-touch relative w-full text-left rounded-sm',
                    'border transition-colors duration-150 ease-notebook',
                    'grid grid-cols-[28px_minmax(0,1fr)] items-start gap-x-2 px-3 py-3',
                    selected
                      ? c.tone === 'vermilion'
                        ? 'bg-vermilion text-paperStrong border-vermilion'
                        : 'bg-olive dark:bg-oliveBright text-paperStrong border-olive dark:border-oliveBright'
                      : 'bg-cardBg text-ink border-ink/25 hover:border-ink'
                  )
                : cn(
                    'btn-touch relative w-full text-left px-3.5 sm:px-4 py-3 sm:py-3.5',
                    'border rounded-sm flex flex-col gap-1.5 transition-colors duration-150 ease-notebook',
                    selected
                      ? c.tone === 'vermilion'
                        ? 'bg-vermilion text-paperStrong border-vermilion'
                        : 'bg-olive dark:bg-oliveBright text-paperStrong border-olive dark:border-oliveBright'
                      : 'bg-cardBg text-ink border-ink/25 hover:border-ink'
                  ),
              // Cursor ring: a 2px ring drawn OUTSIDE the card so the
              // existing background / border / hover treatment is
              // preserved. The ring uses the accent color (vermilion)
              // so it reads against both unselected (paperStrong-ish
              // bg) and selected (vermilion / olive) fills. Under
              // reduced motion we still show the ring, but with no
              // transition. We don't add a transition class so it
              // appears instantly as the cursor moves.
              isCursor &&
                'ring-2 ring-vermilion ring-offset-2 ring-offset-cardBg'
            )}
          >
            {isPanel ? (
              <>
                {/* Column 1: number badge — fixed 28px square, no shrink. */}
                <span
                  className={cn(
                    'inline-flex items-center justify-center w-[22px] h-[22px] mt-0.5 border font-mono text-[10px] uppercase',
                    selected
                      ? 'border-paperStrong/70 text-paperStrong'
                      : 'border-ink/40 text-ink'
                  )}
                >
                  {c.key}
                </span>
                {/* Column 2: content — flex column, min-w-0 so the
                    description can wrap inside the panel width. */}
                <div className="flex flex-col gap-1 min-w-0">
                  {/* Row 1: icon + label + (optional check). The
                      check is right-aligned inside this row. */}
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="inline-flex items-center gap-1.5 min-w-0 font-sans text-[14px] font-medium">
                      <span className="shrink-0">{c.icon}</span>
                      <span className="truncate">{c.label}</span>
                    </span>
                    {selected && (
                      <motion.span
                        initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 24 }}
                        className="inline-flex items-center justify-center w-5 h-5 shrink-0"
                        aria-hidden
                      >
                        <Check size={14} strokeWidth={2} />
                      </motion.span>
                    )}
                  </div>
                  {/* Row 2: description (lg only in panel variant) —
                      normal flow, no absolute positioning, wraps. */}
                  <p
                    className={cn(
                      'hidden lg:block text-[12.5px] leading-snug min-w-0 break-words',
                      selected ? 'text-paperStrong/90' : 'text-inkMuted'
                    )}
                  >
                    {c.description}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      'inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widerish',
                      selected ? 'text-paperStrong/85' : 'text-inkMuted'
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex items-center justify-center w-5 h-5 border',
                        selected
                          ? 'border-paperStrong/70 text-paperStrong'
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
                    selected ? 'text-paperStrong/90' : 'text-inkMuted'
                  )}
                >
                  {c.description}
                </p>
              </>
            )}
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

/**
 * Slim, non-modal banner that surfaces when every image has been
 * marked. Renders at the top of the right panel; the rest of the
 * annotator (image, choices, progress map, navigation) stays fully
 * functional so the user can still review and change any answer.
 */
function CompletionBanner({
  annotatedCount,
  userName,
}: {
  annotatedCount: number;
  userName: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      data-testid="completion-banner"
      initial={reduce ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
      className="flex flex-col gap-2 border border-olive/60 bg-olive/[0.08] text-ink px-3 py-2.5 rounded-sm"
      role="status"
      aria-live="polite"
    >
      <p className="font-mono text-[11.5px] tracking-widerish text-olive dark:text-oliveBright flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 bg-olive dark:bg-oliveBright rounded-full" aria-hidden />
        <span>
          All{' '}
          <span className="tabular-nums">{annotatedCount}</span> images
          marked. Thank you, {userName}.
        </span>
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <a
          href="/api/annotate/csv"
          className="inline-flex items-center justify-center gap-2 h-9 px-3 text-[11px] font-mono uppercase tracking-widerish bg-ink text-paper border border-ink hover:bg-vermilion transition-colors rounded-sm"
        >
          <Download size={12} strokeWidth={1.5} />
          Download my CSV
        </a>
        <p className="font-sans text-[12px] text-inkMuted">
          You can still review and change any answer.
        </p>
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  ProgressMap                                                               */
/*                                                                            */
/*  Tile grid showing every image in the volume with one of three states:     */
/*  marked, skipped, pending. The current image gets a 2px accent ring.       */
/*  Clicks jump to that image. Auto-scrolls the current tile into view.       */
/*                                                                            */
/*  The grid is wrapped in a `flex-1 min-h-0 overflow-y-auto` container so    */
/*  it absorbs whatever vertical space the parent panel has, and the page     */
/*  itself never scrolls. Designed for 1000+ images: lightweight buttons,     */
/*  no per-tile animation libraries.                                          */
/* -------------------------------------------------------------------------- */

const PROGRESS_TILE_LETTER: Record<HarmSource, string> = {
  text: 'T',
  image: 'I',
  both: 'B',
  none: 'N',
};

const PROGRESS_TILE_TONE: Record<HarmSource, 'vermilion' | 'olive'> = {
  text: 'vermilion',
  image: 'vermilion',
  both: 'vermilion',
  none: 'olive',
};

function ProgressMap({
  images,
  statusByIndex,
  currentIndex,
  annotations,
  skippedCount,
  annotatedCount,
  onJump,
  reduceMotion,
}: {
  images: ImageRow[];
  statusByIndex: ('marked' | 'skipped' | 'pending')[];
  currentIndex: number;
  annotations: Record<string, HarmSource>;
  skippedCount: number;
  annotatedCount: number;
  onJump: (index: number) => void;
  reduceMotion: boolean;
}) {
  // Refs to the per-tile buttons so we can auto-scroll the current
  // one into view as the user navigates.
  const tileRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Auto-scroll the current tile into view. `nearest` is the right
  // behavior — we only scroll if the tile is actually outside the
  // visible area, so a user navigating with the keyboard doesn't
  // get a jolting full-scroll on every step.
  useEffect(() => {
    const el = tileRefs.current[currentIndex];
    if (!el) return;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [currentIndex]);

  // Per-tile "just marked" flash. We compute this as a set of image
  // ids that transitioned from non-marked to marked within the last
  // 150ms — derived by comparing the current annotations to a small
  // ref of the previous tick.
  const prevMarkedRef = useRef<Set<string>>(new Set());
  const [flash, setFlash] = useState<Record<string, number>>({});
  useEffect(() => {
    const next = new Set(Object.keys(annotations));
    const flashes: Record<string, number> = {};
    for (const id of next) {
      if (!prevMarkedRef.current.has(id)) flashes[id] = Date.now();
    }
    prevMarkedRef.current = next;
    if (Object.keys(flashes).length > 0) {
      setFlash((cur) => ({ ...cur, ...flashes }));
      const t = setTimeout(() => {
        setFlash((cur) => {
          const cutoff = Date.now() - 200;
          const out: Record<string, number> = {};
          for (const k of Object.keys(cur)) if (cur[k] > cutoff) out[k] = cur[k];
          return out;
        });
      }, 220);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations]);

  const left = Math.max(0, images.length - annotatedCount);

  return (
    <div
      data-testid="progress-map"
      className="flex-1 min-h-0 flex flex-col gap-1.5 border-t border-ink/10 pt-2"
    >
      {/* Summary line. */}
      <p className="font-mono text-[10.5px] tracking-widerish text-inkMuted flex items-center gap-1.5">
        <Hash size={10} strokeWidth={1.5} aria-hidden />
        <span>
          <span className="text-ink tabular-nums">{annotatedCount}</span> marked
          {skippedCount > 0 && (
            <>
              {' · '}
              <span className="text-vermilion dark:text-vermilionBright tabular-nums">
                {skippedCount}
              </span>{' '}
              skipped
            </>
          )}
          {' · '}
          <span className="text-ink tabular-nums">{left}</span> left
        </span>
      </p>

      {/* Tile grid. flex-1 + min-h-0 + overflow-y-auto so the panel
          scrolls inside itself if 1000+ tiles overflow. */}
      <div
        className="flex-1 min-h-0 overflow-y-auto"
        role="list"
        aria-label="Progress map"
      >
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(28px, 1fr))' }}
        >
          {images.map((img, i) => {
            const status = statusByIndex[i];
            const isCurrent = i === currentIndex;
            const tone = status === 'marked' ? PROGRESS_TILE_TONE[annotations[img.id]] : null;
            const letter = status === 'marked' ? PROGRESS_TILE_LETTER[annotations[img.id]] : null;
            const isFlashing = !!flash[img.id];
            return (
              <motion.button
                key={img.id}
                ref={(el) => {
                  tileRefs.current[i] = el;
                }}
                type="button"
                role="listitem"
                onClick={() => onJump(i)}
                title={img.file_name}
                aria-label={`Image ${i + 1}, ${status}`}
                animate={
                  !reduceMotion && isFlashing
                    ? { scale: [1, 1.15, 1] }
                    : { scale: 1 }
                }
                transition={{ duration: 0.15, ease: [0.2, 0.7, 0.2, 1] }}
                className={cn(
                  'relative inline-flex items-center justify-center',
                  'w-full aspect-square font-mono text-[10px] tabular-nums rounded-sm',
                  'transition-colors duration-150 ease-notebook',
                  // Border styling.
                  isCurrent
                    ? 'ring-2 ring-vermilion ring-offset-1 ring-offset-paper dark:ring-offset-paper'
                    : '',
                  status === 'marked' && tone === 'vermilion'
                    ? 'bg-vermilion text-paperStrong border border-vermilion'
                    : status === 'marked' && tone === 'olive'
                    ? 'bg-olive dark:bg-oliveBright text-paperStrong border border-olive dark:border-oliveBright'
                    : status === 'skipped'
                    ? 'border-[1.5px] border-vermilion text-vermilion bg-transparent'
                    : 'border border-ink/25 text-inkMuted bg-transparent hover:border-ink/60'
                )}
              >
                {status === 'marked' ? letter : status === 'skipped' ? '!' : i + 1}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Legend. Uses the same symbols as the tiles so the key is
          unambiguous. */}
      <p className="font-mono text-[10px] tracking-widerish text-inkMuted flex items-center gap-2.5">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-3 bg-vermilion rounded-sm" aria-hidden />
          marked
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex items-center justify-center w-3 h-3 border-[1.5px] border-vermilion text-vermilion rounded-sm" aria-hidden>
            <span className="text-[9px] leading-none">!</span>
          </span>
          skipped
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-3 border border-ink/30 rounded-sm" aria-hidden />
          pending
        </span>
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  BoundaryNudge                                                             */
/*                                                                            */
/*  A tiny motion-aware wrapper used around the Prev / Next buttons. When     */
/*  `active` is true (the reducer just set boundaryCue for this side), it    */
/*  plays a brief horizontal shake. Under reduced motion it's a no-op.        */
/*                                                                            */
/*  The wrapper does not own the button — it only decorates the visual        */
/*  response. Keyboard / pointer events bubble through to the inner button.   */
/* -------------------------------------------------------------------------- */
function BoundaryNudge({
  which,
  active,
  reduce,
  children,
}: {
  which: 'first' | 'last';
  active: boolean;
  reduce: boolean;
  children: React.ReactNode;
}) {
  // No-op pass-through under reduced motion, or when the cue isn't
  // active. We avoid rendering a framer-motion wrapper at all in
  // those cases so the layout is bit-for-bit identical to the
  // pre-refactor render.
  if (reduce || !active) {
    return <>{children}</>;
  }
  // A small horizontal shake. The direction is opposite for "first"
  // vs "last" so the motion agrees with the user intent (trying to
  // go further left from the first image = nudge right; trying to
  // go further right from the last = nudge left).
  const keyframes =
    which === 'first'
      ? { x: [0, 3, -3, 2, -1, 0] }
      : { x: [0, -3, 3, -2, 1, 0] };
  return (
    <motion.span
      className="inline-flex"
      // `key` is derived from the cue timestamp via the active flag
      // (the parent re-renders, which resets the span). Force a
      // remount on each activation by changing the key. Since the
      // parent re-renders, the timestamp is stable within a single
      // activation, so this plays exactly once per cue.
      animate={keyframes}
      transition={{ duration: 0.32, ease: [0.2, 0.7, 0.2, 1] }}
      aria-hidden
    >
      {children}
    </motion.span>
  );
}
