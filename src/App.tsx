import { useCallback, useEffect, useRef, useState } from 'react';
import { CanvasStage } from './components/CanvasStage';
import type { CanvasStageHandle } from './components/CanvasStage';
import { EndControls } from './components/EndControls';
import {
  dataUrlToImageSource,
  directUrlToImageSource,
  extractImageFromClipboard,
  fileToImageSource,
  looksLikeUrl,
  type ImageSource,
} from './lib/imageInput';
import { fetchScreenshot } from './lib/screenshot';
import { PRE_SLASH_DELAY_MS, SLASH_DURATION_MS } from './state/machine';
import './App.css';

const VIDEO_SRC = '/vergil.mp4';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; src: ImageSource; shareUrl: string | null }
  | { kind: 'slashing'; src: ImageSource; shareUrl: string | null }
  | { kind: 'revealed'; src: ImageSource; shareUrl: string | null }
  | { kind: 'error'; message: string };

function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(trimmed)) return `https://${trimmed}`;
  return null;
}

async function urlToImageSource(raw: string): Promise<ImageSource> {
  const normalized = normalizeUrl(raw);
  if (!normalized) throw new Error('not a valid URL');
  const shot = await fetchScreenshot(normalized);
  return {
    kind: 'url',
    label: normalized,
    blobUrl: shot.blobUrl,
    width: shot.width,
    height: shot.height,
  };
}

function updateShareUrl(shareUrl: string | null) {
  // Rewrite the address bar so whatever the user shares (copy-link or the
  // native browser URL) already contains the payload. Pasting the resulting
  // URL into iMessage / Slack / wherever will replay the animation.
  if (shareUrl) {
    history.replaceState(null, '', `?u=${encodeURIComponent(shareUrl)}`);
  } else {
    history.replaceState(null, '', window.location.pathname);
  }
}

export default function App() {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [endControlsVisible, setEndControlsVisible] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [copied, setCopied] = useState(false);
  // Set to true when an auto-fire playback attempt got rejected by the
  // browser's autoplay policy. Once set, we suppress further auto-fires
  // and surface a tap hint; the next user tap runs runSlash inside a
  // gesture context so play() succeeds with sound.
  const [needsTap, setNeedsTap] = useState(false);

  const stageRef = useRef<CanvasStageHandle>(null);
  const autoTriggerRef = useRef<number | null>(null);
  const slashInFlightRef = useRef(false);
  const revealTimerRef = useRef<number | null>(null);
  const bootConsumedRef = useRef(false);

  useEffect(() => {
    stageRef.current?.onVideoEnded(() => setEndControlsVisible(true));
  }, []);

  const submitSource = useCallback(
    async (src: ImageSource, shareUrl: string | null) => {
      setEndControlsVisible(false);
      setCopied(false);
      setNeedsTap(false);
      setState({ kind: 'loading' });
      try {
        await stageRef.current?.loadImage(src);
        updateShareUrl(shareUrl);
        setState({ kind: 'ready', src, shareUrl });
      } catch (err) {
        setState({ kind: 'error', message: (err as Error).message });
      }
    },
    [],
  );

  const submitUrl = useCallback(
    async (raw: string) => {
      setEndControlsVisible(false);
      setCopied(false);
      setNeedsTap(false);
      setState({ kind: 'loading' });
      try {
        const src = await urlToImageSource(raw);
        await stageRef.current?.loadImage(src);
        updateShareUrl(src.label);
        setState({ kind: 'ready', src, shareUrl: src.label });
      } catch (err) {
        setState({ kind: 'error', message: (err as Error).message });
      }
    },
    [],
  );

  const submitFromImageParam = useCallback(
    async (imageUrl: string) => {
      try {
        const src = await directUrlToImageSource(imageUrl);
        await submitSource(src, null);
      } catch (err) {
        setState({ kind: 'error', message: (err as Error).message });
      }
    },
    [submitSource],
  );

  // Boot: if URL carries a payload, kick off the flow immediately.
  useEffect(() => {
    if (bootConsumedRef.current) return;
    bootConsumedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const u = params.get('u');
    const i = params.get('i');
    if (!u && !i) return;
    // Push setState out of the effect body to satisfy react-hooks
    // and avoid any cascading-render warning; this also matches the
    // "external system triggers state" pattern the rule expects.
    queueMicrotask(() => {
      if (u) submitUrl(u);
      else if (i) submitFromImageParam(i);
    });
  }, [submitUrl, submitFromImageParam]);

  const runSlash = useCallback(async () => {
    if (slashInFlightRef.current) return;
    if (state.kind !== 'ready') return;
    slashInFlightRef.current = true;
    if (autoTriggerRef.current !== null) {
      clearTimeout(autoTriggerRef.current);
      autoTriggerRef.current = null;
    }
    const start = performance.now();
    const s = state;

    // Ask CanvasStage to start the video synchronously. If this runs
    // inside a click handler the browser still considers it user-activated,
    // so unmuted play() succeeds; otherwise it may be refused.
    const ok = await stageRef.current?.startVideo(start);
    if (!ok) {
      setNeedsTap(true);
      slashInFlightRef.current = false;
      return;
    }

    setNeedsTap(false);
    setState({ kind: 'slashing', src: s.src, shareUrl: s.shareUrl });
    if (revealTimerRef.current !== null) clearTimeout(revealTimerRef.current);
    revealTimerRef.current = window.setTimeout(() => {
      slashInFlightRef.current = false;
      revealTimerRef.current = null;
      setState((prev) =>
        prev.kind === 'slashing'
          ? { kind: 'revealed', src: prev.src, shareUrl: prev.shareUrl }
          : prev,
      );
    }, SLASH_DURATION_MS);
  }, [state]);

  useEffect(() => {
    if (state.kind !== 'ready') return;
    // If autoplay already got refused, don't retry — user must tap.
    if (needsTap) return;
    if (autoTriggerRef.current !== null) clearTimeout(autoTriggerRef.current);
    autoTriggerRef.current = window.setTimeout(() => {
      runSlash();
    }, PRE_SLASH_DELAY_MS);
    return () => {
      if (autoTriggerRef.current !== null) {
        clearTimeout(autoTriggerRef.current);
        autoTriggerRef.current = null;
      }
    };
  }, [state.kind, runSlash, needsTap]);

  const handleSkipClick = useCallback(() => {
    if (state.kind === 'ready') runSlash();
  }, [state.kind, runSlash]);

  const handleReplay = useCallback(async () => {
    if (state.kind !== 'revealed') return;
    setEndControlsVisible(false);
    setNeedsTap(false);
    stageRef.current?.resetVideo();
    const { src, shareUrl } = state;
    setState({ kind: 'loading' });
    try {
      await stageRef.current?.loadImage(src);
      setState({ kind: 'ready', src, shareUrl });
    } catch (err) {
      setState({ kind: 'error', message: (err as Error).message });
    }
  }, [state]);

  const handleReset = useCallback(() => {
    stageRef.current?.resetVideo();
    stageRef.current?.resetContent();
    setEndControlsVisible(false);
    setCopied(false);
    setNeedsTap(false);
    updateShareUrl(null);
    setState({ kind: 'idle' });
  }, []);

  const handleCopyShare = useCallback(async () => {
    if (state.kind !== 'revealed' || !state.shareUrl) return;
    const link = `${window.location.origin}${window.location.pathname}?u=${encodeURIComponent(state.shareUrl)}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard write can fail in non-secure contexts; silently ignore.
    }
  }, [state]);

  const handleError = useCallback((message: string) => {
    setState({ kind: 'error', message });
  }, []);

  // Window-level paste: user can paste anywhere on the page without
  // focusing an input. Works for image files, data URLs, and text URLs.
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      if (state.kind === 'loading' || state.kind === 'slashing') return;
      const data = e.clipboardData;
      if (!data) return;
      const fileItem = extractImageFromClipboard(data.items ?? null);
      if (fileItem) {
        e.preventDefault();
        try {
          const src = await fileToImageSource(fileItem);
          await submitSource(src, null);
        } catch (err) {
          handleError((err as Error).message);
        }
        return;
      }
      const text = data.getData('text') ?? '';
      if (text.startsWith('data:image/')) {
        e.preventDefault();
        try {
          const src = await dataUrlToImageSource(text);
          await submitSource(src, null);
        } catch (err) {
          handleError((err as Error).message);
        }
        return;
      }
      if (looksLikeUrl(text)) {
        e.preventDefault();
        await submitUrl(text);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [state.kind, submitSource, submitUrl, handleError]);

  // Drag-drop anywhere also submits.
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      setDragActive(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (e.target === document.documentElement) setDragActive(false);
    };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer?.files[0];
      if (!file || !file.type.startsWith('image/')) return;
      try {
        const src = await fileToImageSource(file);
        await submitSource(src, null);
      } catch (err) {
        handleError((err as Error).message);
      }
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [submitSource, handleError]);

  const showHint = state.kind === 'idle';
  const showLoadingHint = state.kind === 'loading';
  const showTapHint = state.kind === 'ready' && needsTap;

  return (
    <div className={`app state-${state.kind}`} onClick={handleSkipClick}>
      <CanvasStage handleRef={stageRef} videoSrc={VIDEO_SRC} />
      {showHint && <div className="idle-hint">paste anywhere</div>}
      {showLoadingHint && <div className="idle-hint loading">summoning...</div>}
      {showTapHint && <div className="idle-hint loading">tap anywhere</div>}
      {state.kind === 'error' && (
        <div className="error-toast" role="alert">
          {state.message}
          <button type="button" onClick={handleReset}>
            try again
          </button>
        </div>
      )}
      <EndControls
        visible={endControlsVisible}
        canShare={state.kind === 'revealed' && !!state.shareUrl}
        copied={copied}
        onReplay={handleReplay}
        onReset={handleReset}
        onCopy={handleCopyShare}
      />
      {dragActive && <div className="drop-overlay" aria-hidden />}
      <a
        className="credit"
        href="https://x.com/jassdotgg"
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        by @jassdotgg
      </a>
    </div>
  );
}
