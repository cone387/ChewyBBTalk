/**
 * Compose 编辑窗口组件。
 * Integrates: tag parsing, visibility cycling, file uploads (button/drag/paste),
 * file previews, auto-resize, and enriched publish payload.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { parseTags, parseAndClean } from './tagParser';
import { nextVisibility, visibilityLabel, Visibility } from './visibilityCycle';
import { uploadFiles, removeFileFromList, UploadedFile } from './uploadManager';
import type { SubmissionSnapshot } from '../../shared/ipc-types';
import logoUrl from '../../../resources/icon.png';

export function ComposeWindow() {
  // Core state
  const [snapshot, setSnapshot] = useState<SubmissionSnapshot | null>(null);
  const snapshotRef = useRef<SubmissionSnapshot | null>(null);
  const operationRef = useRef(false);
  const refreshId = useRef(0);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  // Upload / visibility / tags state
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [tags, setTags] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<number | null>(null);
  const isComposingRef = useRef(false);
  const mountedRef = useRef(false);

  // Refresh session and pending receipt when the window returns to the foreground.
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      const id = ++refreshId.current;
      try {
        const next = await window.desktop.compose.submissionSnapshot();
        if (disposed || id !== refreshId.current) return;
        if (next?.session.scope !== snapshotRef.current?.session.scope) {
          const draft = next ? await window.desktop.compose.getDraft(next.session) : '';
          if (disposed || id !== refreshId.current) return;
          setContent(draft); setUploadedFiles([]); setTags([]);
        }
        snapshotRef.current = next; setSnapshot(next); setLoggedIn(Boolean(next)); mountedRef.current = true;
        if (next?.intent?.state === 'pending' && !operationRef.current) {
          try {
            const intent = await window.desktop.compose.recoverSubmission(next.session, false);
            if (!disposed && id === refreshId.current) {
              const updated = { ...next, intent };
              snapshotRef.current = updated; setSnapshot(updated);
            }
          } catch { /* Keep the original pending receipt and explicit retry controls. */ }
        }
      } catch (error) {
        if (!disposed && id === refreshId.current) {
          setLoggedIn(false);
          setToast({ kind: 'error', text: error instanceof Error ? error.message : '无法读取提交状态' });
        }
      }
    };
    void refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    window.desktop.compose.getVisibility().then(v => setVisibility(v === 'public' ? 'public' : 'private'));
    return () => { disposed = true; window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); };
  }, []);

  useEffect(() => {
    if (!snapshot || !mountedRef.current || submitting) return;
    const timer = window.setTimeout(() => {
      window.desktop.compose.saveDraft(content, snapshot.session).catch(error => {
        setToast({ kind: 'error', text: error instanceof Error ? error.message : '草稿保存失败' });
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [content, snapshot?.session.scope, snapshot?.session.generation, submitting]);

  // Include the recovery panel in the native window's height budget.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    const root = textarea?.closest('.compose-root');
    if (!textarea || !root) return;
    let frame = 0;
    let lastHeight = 0;
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const fixedHeight = Array.from(root.children)
          .filter(element => !element.classList.contains('compose-body') && !element.classList.contains('compose-toast'))
          .filter(element => getComputedStyle(element).position !== 'absolute')
          .reduce((height, element) => height + element.getBoundingClientRect().height, 0);
        textarea.style.height = '0px';
        const natural = textarea.scrollHeight;
        const textHeight = Math.max(42, Math.min(Math.max(63, natural), 300, 500 - fixedHeight - 20));
        textarea.style.height = `${textHeight}px`;
        textarea.style.overflowY = natural > textHeight ? 'auto' : 'hidden';
        const height = Math.max(160, Math.min(500, Math.ceil(fixedHeight + textHeight + 20)));
        if (height !== lastHeight) {
          lastHeight = height;
          void window.desktop.compose.resize(440, height);
        }
      });
    };
    const observer = new ResizeObserver(resize);
    root.querySelectorAll('.submission-recovery, .file-preview-area, .tag-pills').forEach(element => observer.observe(element));
    resize();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [content, tags, uploadedFiles, snapshot?.intent?.state, loggedIn]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (previewImage) setPreviewImage(null);
        else window.desktop.compose.hide();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // Tag parsing on content change (skip during IME composition)
  useEffect(() => {
    if (isComposingRef.current) return;
    setTags(parseTags(content));
  }, [content]);

  // Toast helper
  const showToastMsg = (kind: 'success' | 'error' | 'info', text: string) => {
    if (toastTimerRef.current != null) window.clearTimeout(toastTimerRef.current);
    setToast({ kind, text });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2500);
  };

  // Visibility toggle
  const handleVisibilityToggle = async () => {
    const next = nextVisibility(visibility);
    setVisibility(next);
    await window.desktop.compose.setVisibility(next);
  };

  // Tag button — insert # at cursor
  const handleTagButtonClick = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const text = content;
    const charBefore = start > 0 ? text[start - 1] : ' ';
    const prefix = charBefore !== ' ' && charBefore !== '\n' && start > 0 ? ' #' : '#';
    const newContent = text.substring(0, start) + prefix + text.substring(textarea.selectionEnd);
    setContent(newContent);
    setTimeout(() => {
      const newPos = start + prefix.length;
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  // File upload helper
  const handleUploadFiles = async (files: File[]) => {
    const expected = snapshotRef.current?.session;
    if (files.length === 0 || operationRef.current || !expected) return;
    const assertUploadSession = async () => {
      const current = await window.desktop.compose.submissionSnapshot();
      if (current?.session.scope !== expected.scope || current.session.generation !== expected.generation) {
        throw new Error('账号已切换，附件未加入当前编辑器');
      }
    };
    setIsUploading(true);
    try {
      const [apiUrl] = JSON.parse(expected.scope) as [string, string];
      const token = await window.desktop.auth.getValidAccessToken();
      await assertUploadSession();
      const uploaded = await uploadFiles(files, apiUrl, token);
      await assertUploadSession();
      setUploadedFiles((prev) => [...prev, ...uploaded]);
    } catch (err: unknown) {
      showToastMsg('error', err instanceof Error ? err.message : '上传失败');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAttachClick = () => { fileInputRef.current?.click(); };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    handleUploadFiles(Array.from(fileList));
    e.target.value = '';
  };

  // Drag-and-drop
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) setIsDragOver(true);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) e.dataTransfer.dropEffect = 'copy';
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const { clientX, clientY } = e;
    if (clientX <= rect.left || clientX >= rect.right || clientY <= rect.top || clientY >= rect.bottom) {
      setIsDragOver(false);
    }
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleUploadFiles(files);
  };

  // Clipboard paste
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) { showToastMsg('info', '正在上传剪贴板图片…'); handleUploadFiles([file]); }
        return;
      }
    }
  };

  // Textarea keydown: Enter = publish, Shift+Enter = newline
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      publish();
    }
  };

  const handleRemoveFile = (uid: string) => {
    setUploadedFiles((prev) => removeFileFromList(prev, uid));
  };

  const recover = async (retry: boolean) => {
    if (!snapshot || operationRef.current) return;
    operationRef.current = true; setSubmitting(true);
    try {
      await window.desktop.compose.saveDraft(content, snapshot.session);
      const intent = await window.desktop.compose.recoverSubmission(snapshot.session, retry);
      const updated = { ...snapshot, intent };
      snapshotRef.current = updated; setSnapshot(updated);
      showToastMsg('info', intent.deleted ? '原提交已删除，不会重新创建。' : '原提交已确认，当前输入仍保留。');
    } catch (error) { showToastMsg('error', error instanceof Error ? error.message : '核对失败，原提交已保留'); }
    finally { operationRef.current = false; setSubmitting(false); }
  };
  const publish = useCallback(async () => {
    if (!content.trim() || operationRef.current || isUploading) return;
    if (!loggedIn || !snapshot) { window.desktop.login.show(); return; }
    operationRef.current = true; setSubmitting(true);
    try {
      const { tags: parsedTags, cleanedContent } = parseAndClean(content);
      const intent = await window.desktop.compose.publishSubmission(snapshot.session, {
        content: cleanedContent, post_tags: parsedTags.join(','),
        attachments: uploadedFiles.map(f => ({ uid: f.uid })), visibility,
        context: { source: { client: 'Desktop', platform: navigator.platform } },
      });
      const updated = { ...snapshot, intent };
      snapshotRef.current = updated; setSnapshot(updated);
      if (intent.deleted) { showToastMsg('info', '原提交已删除，不会重新创建。当前输入仍保留。'); return; }
      try {
        await window.desktop.compose.clearDraft(snapshot.session);
        await window.desktop.compose.forgetSubmission(snapshot.session, intent.key);
      } catch {
        showToastMsg('error', '发布成功，但本地清理失败，请核对原提交。');
        return;
      }
      snapshotRef.current = { ...snapshot, intent: undefined };
      setSnapshot(snapshotRef.current);
      showToastMsg('success', '已发布');
      setContent(''); setUploadedFiles([]); setTags([]);
      setTimeout(() => textareaRef.current?.focus(), 100);
    } catch (error) {
      showToastMsg('error', error instanceof Error ? error.message : '发布失败，内容已保留');
      try {
        const next = await window.desktop.compose.submissionSnapshot();
        if (next?.session.scope === snapshot.session.scope && next.session.generation === snapshot.session.generation) {
          snapshotRef.current = next; setSnapshot(next);
        }
      } catch { /* Leave input untouched if persistence cannot be read. */ }
    } finally { operationRef.current = false; setSubmitting(false); }
  }, [content, loggedIn, snapshot, uploadedFiles, visibility, isUploading]);

  // Loading state
  if (loggedIn === null) {
    return (
      <div className="compose-root">
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: '#9CA3AF', fontSize: 13 }}>加载中…</div>
      </div>
    );
  }

  return (
    <div className="compose-root" style={{ pointerEvents: submitting ? 'none' : 'auto' }} onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <header className="compose-titlebar">
        <img className="titlebar-logo" src={logoUrl} alt="" width="16" height="16" draggable={false} />
        <div className="titlebar-spacer" />
        <button className="titlebar-btn" onClick={() => window.desktop.settings.show()} title="设置" aria-label="设置">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </button>
        <button className="close-btn" onClick={() => window.desktop.compose.hide()} aria-label="关闭">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </header>

      <main className="compose-body">
        <textarea
          disabled={submitting}
          ref={textareaRef}
          className="compose-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleTextareaKeyDown}
          onPaste={handlePaste}
          onCompositionStart={() => { isComposingRef.current = true; }}
          onCompositionEnd={(e) => { isComposingRef.current = false; setContent((e.target as HTMLTextAreaElement).value); }}
          placeholder="你要BB什么？"
          spellCheck={false}
          rows={3}
        />
      </main>

      {/* File preview area */}
      {uploadedFiles.length > 0 && (
        <div className="file-preview-area">
          {uploadedFiles.map((file) => (
            <div key={file.uid} className="file-preview-item">
              <button className="file-preview-remove" onClick={() => handleRemoveFile(file.uid)} aria-label={`移除 ${file.name}`}>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1 1l6 6M7 1l-6 6" /></svg>
              </button>
              {file.type === 'image' ? (
                <img src={file.url} alt={file.name} className="file-preview-img" onClick={() => setPreviewImage(file.url)} />
              ) : (
                <div className="file-preview-file">
                  <svg className="file-preview-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="M9 1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V5L9 1z" /><path d="M9 1v4h4" /></svg>
                  <span className="file-preview-name">{file.name}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {snapshot?.intent && <section className="submission-recovery" aria-label="原提交恢复" style={{ padding: '8px 12px', fontSize: 13 }}>
        <p role="status">{snapshot.intent.state === 'pending' ? '有一份发布结果待核对' : snapshot.intent.deleted ? '原提交已删除，当前输入仍保留' : '原提交已确认，当前输入仍保留'}</p>
        <details><summary>查看原提交内容</summary><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{snapshot.intent.payload.content}</p></details>
        {snapshot.intent.state === 'pending' && <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ minHeight: 44 }} disabled={submitting} onClick={() => { void recover(false); }}>核对发布结果</button>
          <button style={{ minHeight: 44 }} disabled={submitting} onClick={() => { void recover(true); }}>重试原提交</button>
        </div>}
      </section>}
      {/* Tag pills — between textarea and toolbar */}
      {tags.length > 0 && (
        <div className="tag-pills">
          {tags.map((tag) => (<span key={tag} className="tag-pill">#{tag}</span>))}
        </div>
      )}

      <footer className="compose-toolbar">
        <button className={`tool-btn visibility-btn ${visibility !== 'private' ? 'active' : ''}`} title={visibilityLabel(visibility)} onClick={handleVisibilityToggle}>
          {visibility === 'private' && (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5 7V5a3 3 0 016 0v2" /></svg>)}
          {visibility === 'public' && (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6" /><path d="M2 8h12M8 2c1.5 1.5 2.5 3.5 2.5 6s-1 4.5-2.5 6c-1.5-1.5-2.5-3.5-2.5-6s1-4.5 2.5-6z" /></svg>)}
        </button>
        <button className="tool-btn" title="添加标签" onClick={handleTagButtonClick}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M5.5 1.5L4 14.5M12 1.5l-1.5 13M1.5 5.5h13M1.5 10.5h13" /></svg>
        </button>
        <button className="tool-btn" title="上传图片" onClick={handleAttachClick} disabled={isUploading}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="12" height="10" rx="1.5" /><circle cx="5.5" cy="6.5" r="1.5" /><path d="M14 11l-3-3-2 2-2-2-5 5" /></svg>
        </button>
        <button className="tool-btn" title="上传附件" onClick={handleAttachClick} disabled={isUploading}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M14 8.5l-5.5 5.5a3.5 3.5 0 01-5-5l6-6a2.5 2.5 0 013.5 3.5l-5.5 5.5a1 1 0 01-1.5-1.5L11 5.5" /></svg>
        </button>
        {isUploading && <span className="uploading-indicator">上传中…</span>}
        <div className="toolbar-spacer" />
        {content.length > 0 && <span className="char-count">{content.length} 字</span>}
        {loggedIn ? (
          <button className="publish-btn" onClick={publish} disabled={!content.trim() || submitting || isUploading}>
            {submitting ? '…' : '发布'}<span className="hint">⏎</span>
          </button>
        ) : (
          <button className="publish-btn login-btn" onClick={() => window.desktop.login.show()}>登录</button>
        )}
      </footer>

      <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.rar" style={{ display: 'none' }} onChange={handleFileInputChange} />

      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
      {isDragOver && <div className="drag-overlay"><span>松开以上传文件</span></div>}
      {previewImage && (
        <div className="image-preview-overlay" onClick={() => setPreviewImage(null)}>
          <img src={previewImage} className="image-preview-img" onClick={(e) => e.stopPropagation()} alt="预览" />
        </div>
      )}

      {/* Login is now a separate window — opened via window.desktop.login.show() */}
    </div>
  );
}
