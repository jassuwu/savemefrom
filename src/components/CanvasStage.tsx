import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ImageSource } from '../lib/imageInput';

export interface CanvasStageHandle {
  loadImage(src: ImageSource): Promise<void>;
  // Resolves true if the video actually started playing, false if the
  // browser blocked unmuted autoplay. Callers should treat false as "stay
  // put, let the user tap" — we never fall back to muted because the
  // voiceline is half the meme.
  startVideo(atMs: number): Promise<boolean>;
  onVideoEnded(cb: () => void): void;
  resetContent(): void;
  resetVideo(): void;
}

interface Props {
  handleRef: RefObject<CanvasStageHandle | null>;
  videoSrc: string;
}

export function CanvasStage({ handleRef, videoSrc }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const endedCbRef = useRef<(() => void) | null>(null);
  const pendingStartRef = useRef<number | null>(null);
  const blobUrlsRef = useRef<string[]>([]);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnded = () => endedCbRef.current?.();
    video.addEventListener('ended', onEnded);
    return () => {
      video.removeEventListener('ended', onEnded);
      for (const url of blobUrlsRef.current) URL.revokeObjectURL(url);
      blobUrlsRef.current = [];
    };
  }, []);

  useImperativeHandle(handleRef, () => ({
    loadImage(src: ImageSource) {
      // URL source already owns its blob via fetchScreenshot; for file/data
      // sources we created a blob URL in imageInput, so track both for
      // later revocation on reset/unmount.
      if (src.blobUrl && !blobUrlsRef.current.includes(src.blobUrl)) {
        blobUrlsRef.current.push(src.blobUrl);
      }
      setImgUrl(src.blobUrl);
      return new Promise<void>((resolve, reject) => {
        const img = imgRef.current;
        if (!img) {
          resolve();
          return;
        }
        if (img.complete && img.naturalWidth > 0 && img.src.endsWith(src.blobUrl)) {
          resolve();
          return;
        }
        const onLoad = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error('image failed to load'));
        };
        const cleanup = () => {
          img.removeEventListener('load', onLoad);
          img.removeEventListener('error', onError);
        };
        img.addEventListener('load', onLoad);
        img.addEventListener('error', onError);
      });
    },
    startVideo(atMs: number) {
      const video = videoRef.current;
      if (!video) return Promise.resolve(false);
      video.currentTime = 0;
      const delay = Math.max(0, atMs - performance.now());
      if (pendingStartRef.current !== null) {
        clearTimeout(pendingStartRef.current);
      }
      return new Promise<boolean>((resolve) => {
        const doPlay = async () => {
          pendingStartRef.current = null;
          try {
            await video.play();
            setVideoPlaying(true);
            resolve(true);
          } catch {
            // Unmuted autoplay blocked. Don't retry muted — let the caller
            // keep the UI in its pre-slash state so the next user tap (which
            // runs inside a gesture) can re-fire startVideo with sound.
            resolve(false);
          }
        };
        if (delay <= 0) doPlay();
        else pendingStartRef.current = window.setTimeout(doPlay, delay);
      });
    },
    onVideoEnded(cb) {
      endedCbRef.current = cb;
    },
    resetContent() {
      setImgUrl(null);
    },
    resetVideo() {
      const video = videoRef.current;
      if (!video) return;
      if (pendingStartRef.current !== null) {
        clearTimeout(pendingStartRef.current);
        pendingStartRef.current = null;
      }
      video.pause();
      video.currentTime = 0;
      setVideoPlaying(false);
    },
  }));

  return (
    <div className="canvas-stage">
      {imgUrl && (
        <img
          ref={imgRef}
          className="page-image"
          src={imgUrl}
          alt=""
          draggable={false}
        />
      )}
      <video
        ref={videoRef}
        className={`video-element ${videoPlaying ? 'playing' : ''}`}
        src={videoSrc}
        preload="auto"
        playsInline
      />
    </div>
  );
}
