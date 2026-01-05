import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { bbtalkApi } from "../services/api/bbtalkApi"
import type { BBTalk } from '../types';

export default function BBTalkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [bbtalk, setBBTalk] = useState<BBTalk | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadBBTalk = async () => {
      if (!id) {
        setError('无效的 BBTalk ID');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const data = await bbtalkApi.getPublicBBTalk(id);
        setBBTalk(data);
      } catch (err: any) {
        console.error('加载 BBTalk 失败:', err);
        setError(err.message || '加载失败');
      } finally {
        setIsLoading(false);
      }
    };

    loadBBTalk();
  }, [id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !bbtalk) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-800 mb-2">BBTalk 不存在</h2>
          <p className="text-gray-600">该内容可能已被删除、不存在或不是公开的</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-2xl shadow-sm p-8">
          <p className="text-gray-800 whitespace-pre-wrap leading-relaxed text-lg">
            {bbtalk.content}
          </p>
          
          {bbtalk.tags && bbtalk.tags.length > 0 && (
            <div className="mt-6 flex gap-2 flex-wrap">
              {bbtalk.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="px-3 py-1.5 text-white rounded-full text-sm font-medium"
                  style={{ backgroundColor: tag.color || '#3B82F6' }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}
          
          <div className="mt-8 pt-6 border-t border-gray-200 text-sm text-gray-500">
            <span>{new Date(bbtalk.createdAt).toLocaleDateString('zh-CN')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
