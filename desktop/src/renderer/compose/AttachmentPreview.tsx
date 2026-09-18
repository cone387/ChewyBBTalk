import { useEffect, useState } from 'react';
import type { UploadItem, SubmissionSession } from '../../shared/ipc-types';

export function AttachmentPreview({ item, session, onPreview }: { item: UploadItem; session: SubmissionSession; onPreview: (url: string) => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    let objectUrl = '';
    setError(false);
    if (item.type === 'image') void window.desktop.compose.previewUpload(session, item.id).then(data => {
      if (disposed) return;
      objectUrl = URL.createObjectURL(new Blob([new Uint8Array(data.bytes)], { type: data.mimeType }));
      setUrl(objectUrl);
    }).catch(() => { if (!disposed) setError(true); });
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [item.id, session.scope, session.generation, attempt]);
  if (item.type !== 'image') return <span className="file-preview-name">{item.name}</span>;
  if (error) return <button className="preview-retry" onClick={() => setAttempt(value => value + 1)}>重试预览</button>;
  return url ? <img src={url} alt={item.name} className="file-preview-img" onError={() => setError(true)} onClick={() => onPreview(url)} /> : <span>加载预览…</span>;
}
