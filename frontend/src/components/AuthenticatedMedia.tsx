import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { apiClient } from '../services/api/apiClient';

function attachmentPath(src: string): string | null {
  try {
    const url = new URL(src, window.location.origin);
    const base = new URL(import.meta.env.VITE_API_BASE_URL || window.location.origin);
    return url.origin === base.origin && url.pathname.startsWith('/api/v1/attachments/') ? url.pathname + url.search : null;
  } catch { return null; }
}

export function AttachmentVideo({ src, ...props }: ComponentProps<'video'> & { src: string }) {
  const path = attachmentPath(src);
  const [blobUrl, setBlobUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const resource = useRef('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (resource.current) URL.revokeObjectURL(resource.current); }; }, []);
  const load = async () => {
    if (!path) return;
    setBusy(true); setError('');
    try {
      const blob = await apiClient.download(path);
      if (!mounted.current) return;
      resource.current = URL.createObjectURL(blob); setBlobUrl(resource.current);
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : '加载失败'); }
    finally { if (mounted.current) setBusy(false); }
  };
  if (path && !blobUrl) return <div className="rounded-lg bg-gray-100 p-4">
    <button className="min-h-11 text-blue-700" disabled={busy} onClick={load}>{busy ? '正在加载视频…' : error ? '加载失败，重试视频' : '加载视频'}</button>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
  return <video {...props} src={blobUrl || src} />;
}

export function AttachmentDownload({ href = '', children, ...props }: ComponentProps<'a'>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <span>
    <a {...props} href={href} aria-busy={busy} onClick={async event => {
      const path = attachmentPath(href);
      if (!path) return;
      event.preventDefault(); if (busy) return;
      setBusy(true); setError('');
      try {
        const blob = await apiClient.download(path);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = typeof props.download === 'string' ? props.download : '附件';
        document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch (e) { setError(e instanceof Error ? e.message : '下载失败，请重试'); }
      finally { setBusy(false); }
    }}>{busy ? '正在下载…' : children}</a>
    {error && <span role="alert" className="block text-sm text-red-700">{error}</span>}
  </span>;
}
