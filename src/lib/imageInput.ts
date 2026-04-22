export interface ImageSource {
  kind: 'file' | 'url' | 'data';
  label: string;
  blobUrl: string;
  width: number;
  height: number;
}

export async function fileToImageSource(file: File): Promise<ImageSource> {
  const blobUrl = URL.createObjectURL(file);
  const { width, height } = await measure(blobUrl);
  return { kind: 'file', label: file.name, blobUrl, width, height };
}

export async function dataUrlToImageSource(
  dataUrl: string,
  label = 'pasted image',
): Promise<ImageSource> {
  const blob = await (await fetch(dataUrl)).blob();
  const blobUrl = URL.createObjectURL(blob);
  const { width, height } = await measure(blobUrl);
  return { kind: 'data', label, blobUrl, width, height };
}

export async function directUrlToImageSource(url: string): Promise<ImageSource> {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`image fetch failed: ${res.status}`);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const { width, height } = await measure(blobUrl);
  return { kind: 'url', label: url, blobUrl, width, height };
}

function measure(
  src: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = src;
  });
}

export function extractImageFromClipboard(
  items: DataTransferItemList | null,
): File | null {
  if (!items) return null;
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) return f;
    }
  }
  return null;
}

export function looksLikeUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(trimmed);
}
