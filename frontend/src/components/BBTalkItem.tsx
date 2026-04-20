import { useState } from 'react';
import type { BBTalk, Comment } from '../types';
import { bbtalkApi } from '../services/api/bbtalkApi';
import MarkdownRenderer from './MarkdownRenderer';

interface BBTalkItemProps {
  bbtalk: BBTalk;
  onDelete: (id: string) => void;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(diff / 86400000);
  if (days < 7) return `${days}天前`;
  return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
}

export default function BBTalkItem({ bbtalk, onDelete }: BBTalkItemProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localCommentCount, setLocalCommentCount] = useState(bbtalk.commentCount ?? 0);

  const loadComments = async () => {
    if (loading || loaded) {
      setExpanded(!expanded);
      return;
    }
    setLoading(true);
    try {
      const data = await bbtalkApi.getComments(bbtalk.id);
      setComments(data);
      setLoaded(true);
      setExpanded(true);
    } catch {} finally {
      setLoading(false);
    }
  };

  const handleSubmitComment = async () => {
    const text = newComment.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const comment = await bbtalkApi.createComment(bbtalk.id, text);
      setComments(prev => [...prev, comment]);
      setNewComment('');
      setShowInput(false);
      setLocalCommentCount(prev => prev + 1);
      setLoaded(true);
      setExpanded(true);
    } catch (e: any) {
      alert('发送失败: ' + (e.message || '请稍后重试'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (comment: Comment) => {
    if (!confirm('确定要删除这条评论吗？')) return;
    try {
      await bbtalkApi.deleteComment(bbtalk.id, comment.uid);
      setComments(prev => prev.filter(c => c.uid !== comment.uid));
      setLocalCommentCount(prev => Math.max(0, prev - 1));
    } catch (e: any) {
      alert('删除失败: ' + e.message);
    }
  };

  const handleDelete = () => {
    if (confirm('确定要删除这条 BBTalk 吗?')) {
      onDelete(bbtalk.id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitComment();
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      {bbtalk.isPinned && (
        <div className="flex items-center gap-1 mb-2 text-amber-500 text-xs font-semibold">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.789l1.599.8L9 4.323V3a1 1 0 011-1z"/></svg>
          置顶
        </div>
      )}

      <MarkdownRenderer content={bbtalk.content} />
      
      {bbtalk.tags && bbtalk.tags.length > 0 && (
        <div className="mt-4 flex gap-2 flex-wrap">
          {bbtalk.tags.map((tag) => (
            <span
              key={tag.id}
              className="px-3 py-1 text-white rounded-full text-sm"
              style={{ backgroundColor: tag.color || '#3B82F6' }}
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}
      
      {/* Footer */}
      <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
        <div className="flex items-center gap-3">
          <span>{formatTime(bbtalk.createdAt)}</span>
          <span>{bbtalk.visibility === 'public' ? '🌐 公开' : '🔒 私密'}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setShowInput(!showInput); if (!loaded && localCommentCount > 0) loadComments(); }}
            className="text-gray-400 hover:text-blue-500 flex items-center gap-1 transition-colors"
          >
            💬 {localCommentCount > 0 && <span>{localCommentCount}</span>}
          </button>
          <button onClick={handleDelete} className="text-gray-400 hover:text-red-500 transition-colors">
            删除
          </button>
        </div>
      </div>

      {/* Inline comments */}
      {(expanded && comments.length > 0) && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          {comments.map(comment => (
            <div key={comment.uid} className="flex items-start justify-between gap-2 group text-sm">
              <p className="flex-1 text-gray-700">
                <span className="font-medium text-blue-600">{comment.userDisplayName || comment.userUsername}</span>
                ：{comment.content}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-gray-400">{formatTime(comment.createdAt)}</span>
                <button
                  onClick={() => handleDeleteComment(comment)}
                  className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load more / collapse */}
      {loaded && comments.length > 0 && (
        <button onClick={() => setExpanded(!expanded)} className="mt-1 text-xs text-blue-500 hover:text-blue-600">
          {expanded ? '收起评论' : `查看 ${comments.length} 条评论`}
        </button>
      )}
      {!loaded && localCommentCount > 0 && !loading && (
        <button onClick={loadComments} className="mt-2 text-xs text-blue-500 hover:text-blue-600">
          {loading ? '加载中...' : `查看 ${localCommentCount} 条评论`}
        </button>
      )}

      {/* Comment input */}
      {showInput && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="写一条评论... (Enter 发送)"
            className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-full focus:outline-none focus:border-blue-400 bg-gray-50"
            disabled={submitting}
            autoFocus
          />
          <button
            onClick={handleSubmitComment}
            disabled={!newComment.trim() || submitting}
            className="px-4 py-2 text-sm text-white bg-blue-500 rounded-full hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? '...' : '发送'}
          </button>
        </div>
      )}
    </div>
  );
}
