import { useState } from 'react';
import { bbtalkApi } from '../services/api/bbtalkApi';
import type { Tag, BBTalk } from '../types';

interface BBTalkPublisherProps {
  tags: Tag[];
  onCreate: (bbtalk: BBTalk) => void;
}

export default function BBTalkPublisher({ tags, onCreate }: BBTalkPublisherProps) {
  const [content, setContent] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePublish = async () => {
    if (!content.trim()) return;

    setIsSubmitting(true);
    try {
      const result = await bbtalkApi.createBBTalk({
        content,
        tags: selectedTags,
        visibility,
        context: { source: { client: 'Web', version: '1.0' } },
      });
      onCreate(result);
      setContent('');
      setSelectedTags([]);
      setVisibility('private');
    } catch (error) {
      console.error('发布失败:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleTag = (tagName: string) => {
    setSelectedTags(prev =>
      prev.includes(tagName)
        ? prev.filter(t => t !== tagName)
        : [...prev, tagName]
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="分享你的想法..."
        className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        rows={6}
      />
      
      <div className="mt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">选择标签</label>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.name)}
                className={`px-3 py-1 rounded-full text-sm transition ${
                  selectedTags.includes(tag.name)
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {tag.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">可见性</label>
          <div className="flex gap-4">
            <label className="flex items-center">
              <input
                type="radio"
                value="private"
                checked={visibility === 'private'}
                onChange={(e) => setVisibility(e.target.value as 'public' | 'private')}
                className="mr-2"
              />
              <span>仅自己</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="public"
                checked={visibility === 'public'}
                onChange={(e) => setVisibility(e.target.value as 'public' | 'private')}
                className="mr-2"
              />
              <span>公开</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handlePublish}
            disabled={!content.trim() || isSubmitting}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? '发布中...' : '发布'}
          </button>
        </div>
      </div>
    </div>
  );
}
