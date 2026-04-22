// Vercel Edge Middleware.
//
// When a link-preview bot hits `/?u=<target>`, fetch the target page's
// OG/Twitter/title meta tags and re-emit them on a minimal HTML response.
// Non-bot traffic passes straight through to the SPA.

export const config = {
  matcher: '/',
};

const BOT_UA_RE =
  /twitterbot|slackbot-linkexpanding|slackbot|facebookexternalhit|facebot|discordbot|telegrambot|linkedinbot|redditbot|whatsapp|skypeuripreview|iframely|embedly|vkshare|applebot|googlebot|bingbot|pinterest|x-bot|ia_archiver|mastodon/i;

interface MetaBag {
  [k: string]: string | undefined;
}

function parseMeta(html: string): MetaBag {
  const out: MetaBag = {};
  // Bound the regex scan to <head> if we can find it — OG tags never live
  // below that, and some pages ship megabytes of body HTML.
  const headMatch = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html);
  const scope = headMatch ? headMatch[1] : html.slice(0, 80_000);

  const tagRe = /<meta\s+([^>]+?)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(scope)) !== null) {
    const attrs = m[1];
    const keyMatch = /\b(?:property|name)\s*=\s*(?:"([^"]+)"|'([^']+)')/i.exec(
      attrs,
    );
    const valMatch = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
    if (!keyMatch || !valMatch) continue;
    const key = (keyMatch[1] || keyMatch[2] || '').toLowerCase();
    const val = valMatch[1] ?? valMatch[2] ?? '';
    if (key && !(key in out)) out[key] = val;
  }
  const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(scope);
  if (titleMatch) out.__title = titleMatch[1].trim();
  return out;
}

function esc(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function resolveUrl(maybeRelative: string, base: string): string {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return '';
  }
}

function buildPreviewHtml(
  tags: MetaBag,
  shareUrl: string,
  targetUrl: string,
  origin: string,
): string {
  const title =
    tags['og:title'] || tags['twitter:title'] || tags.__title || 'save me from';
  const description =
    tags['og:description'] ||
    tags['twitter:description'] ||
    tags.description ||
    '';

  let image = tags['og:image'] || tags['twitter:image'] || '';
  if (image && !/^https?:\/\//i.test(image)) {
    image = resolveUrl(image, targetUrl);
  }
  if (!image) image = `${origin}/og.png`;

  const siteName = tags['og:site_name'] || '';
  const ogType = tags['og:type'] || 'website';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<link rel="canonical" href="${esc(shareUrl)}" />
<meta property="og:type" content="${esc(ogType)}" />
<meta property="og:url" content="${esc(shareUrl)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${esc(image)}" />
${siteName ? `<meta property="og:site_name" content="${esc(siteName)}" />` : ''}
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(image)}" />
</head>
<body></body>
</html>`;
}

async function fetchTargetHtml(targetUrl: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent':
          'Mozilla/5.0 (compatible; savemefrombot/1.0; +https://savefrom.jass.gg)',
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
      },
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!/html|xml/i.test(ct)) return null;
    const text = await res.text();
    return text.slice(0, 250_000);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default async function middleware(
  req: Request,
): Promise<Response | undefined> {
  const url = new URL(req.url);
  if (url.pathname !== '/') return;

  const ua = req.headers.get('user-agent') || '';
  if (!BOT_UA_RE.test(ua)) return;

  const targetRaw = url.searchParams.get('u');
  if (!targetRaw) return;

  let target: URL;
  try {
    target = new URL(targetRaw);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return;
  } catch {
    return;
  }

  const html = await fetchTargetHtml(target.toString());
  if (!html) return;

  const tags = parseMeta(html);
  if (!tags['og:title'] && !tags['twitter:title'] && !tags.__title) return;

  const body = buildPreviewHtml(tags, url.toString(), target.toString(), url.origin);
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=3600',
      // Tell caches the response depends on the UA + query so bots get the
      // preview card while humans get the SPA.
      vary: 'User-Agent',
    },
  });
}
