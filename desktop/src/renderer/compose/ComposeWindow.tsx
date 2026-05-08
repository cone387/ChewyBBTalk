/**
 * Compose 编辑窗口组件。
 *
 * 功能：
 *   - 三层布局：标题栏 / textarea / 操作栏
 *   - 草稿自动保存（debounce 2s）
 *   - Ctrl/Cmd+Enter 发布
 *   - Esc 隐藏
 *   - 发布成功 Toast + 清空
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export function ComposeWindow() {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftTimerRef = useRef<number | null>(null);

  // 启动时加载草稿
  useEffect(() => {
    window.desktop.compose.getDraft().then((draft) => {
      if (draft) setContent(draft);
    });
    // 自动聚焦
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, []);

  // 草稿自动保存（debounce 2s）
  useEffect(() => {
    if (draftTimerRef.current != null) window.clearTimeout(draftTimerRef.current);
    draftTimerRef.current = window.setTimeout(() => {
      window.desktop.compose.saveDraft(content);
    }, 2000);
    return () => {
      if (draftTimerRef.current != null) window.clearTimeout(draftTimerRef.current);
    };
  }, [content]);

  // 键盘快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Enter → 发布
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        publish();
      }
      // Esc → 隐藏
      if (e.key === 'Escape') {
        e.preventDefault();
        window.desktop.compose.hide();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const showToast = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 2000);
  };

  const publish = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    try {
      const apiUrl = await window.desktop.compose.getApiUrl();
      const response = await fetch(`${apiUrl}/api/v1/bbtalk/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: trimmed,
          visibility: 'private',
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || err.error || `HTTP ${response.status}`);
      }

      // 成功
      showToast('success', '已发布');
      setContent('');
      await window.desktop.compose.clearDraft();
      // 1 秒后自动隐藏
      setTimeout(() => window.desktop.compose.hide(), 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '发布失败';
      showToast('error', msg);
    } finally {
      setSubmitting(false);
    }
  }, [content, submitting]);

  return (
    <div className="compose-root">
      <header className="compose-titlebar">
        <div className="titlebar-spacer" />
        <button
          className="close-btn"
          onClick={() => window.desktop.compose.hide()}
          aria-label="关闭"
        >
          ×
        </button>
      </header>

      <main className="compose-body">
        <textarea
          ref={textareaRef}
          className="compose-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="记一下点什么…"
          spellCheck={false}
        />
      </main>

      <footer className="compose-toolbar">
        <div className="toolbar-spacer" />
        <span className="char-count">{content.length}</span>
        <button
          className="publish-btn"
          onClick={publish}
          disabled={!content.trim() || submitting}
        >
          {submitting ? '发布中…' : '发布'}
          <span className="hint">⌘⏎</span>
        </button>
      </footer>

      {toast && (
        <div className={`toast ${toast.kind}`}>{toast.text}</div>
      )}
    </div>
  );
}
