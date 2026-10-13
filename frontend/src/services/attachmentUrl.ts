/** Canonicalize stored API media links without changing object-storage URLs. */
export function normalizeAttachmentUrl(url: string, apiBase: string): string {
  const base = apiBase || (typeof window === 'undefined' ? undefined : window.location.origin);
  if (!url) return url;
  try {
    const parsed = new URL(url, base);
    if (!base || parsed.origin !== new URL(base).origin) return url;
    if (!/^\/api\/v1\/attachments\/files\/[^/]+\/(preview|download|content)\/$/.test(parsed.pathname)) return url;
    return url.replace(/\/(preview|download|content)\/(?=[?#]|$)/, '/$1');
  } catch {
    return url;
  }
}
