import type { BBTalk } from '../types';

interface BBTalkItemProps {
  bbtalk: BBTalk;
  onUpdate: (id: string, updated: Partial<BBTalk>) => void;
  onDelete: (id: string) => void;
}

export default function BBTalkItem({ bbtalk, onDelete }: BBTalkItemProps) {
  const handleDelete = () => {
    if (confirm('确定要删除这条 BBTalk 吗?')) {
      onDelete(bbtalk.id);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">
        {bbtalk.content}
      </p>
      
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
      
      <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
        <div className="flex items-center gap-3">
          <span>{new Date(bbtalk.createdAt).toLocaleDateString('zh-CN')}</span>
          <span>{bbtalk.visibility === 'public' ? '公开' : '私密'}</span>
        </div>
        <button
          onClick={handleDelete}
          className="text-red-600 hover:text-red-700"
        >
          删除
        </button>
      </div>
    </div>
  );
}
