export interface ScreenshotResult {
  blobUrl: string;
  width: number;
  height: number;
}

const MICROLINK_BASE = 'https://api.microlink.io';

export async function fetchScreenshot(url: string): Promise<ScreenshotResult> {
  const qs = new URLSearchParams({
    url,
    screenshot: 'true',
    meta: 'false',
    embed: 'screenshot.url',
  });
  const apiUrl = `${MICROLINK_BASE}/?${qs.toString()}`;

  const res = await fetch(apiUrl, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Microlink failed (${res.status})`);
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);

  const dims = await measureImage(blobUrl);
  return { blobUrl, width: dims.width, height: dims.height };
}

export async function loadDirectImage(url: string): Promise<ScreenshotResult> {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const dims = await measureImage(blobUrl);
  return { blobUrl, width: dims.width, height: dims.height };
}

function measureImage(
  src: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Image failed to decode'));
    img.src = src;
  });
}

export function revokeBlob(url: string | null) {
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
}
