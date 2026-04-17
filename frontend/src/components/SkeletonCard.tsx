export default function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 animate-pulse">
      {/* Text lines */}
      <div className="space-y-3">
        <div className="h-4 bg-gray-200 rounded w-full" />
        <div className="h-4 bg-gray-200 rounded w-5/6" />
        <div className="h-4 bg-gray-200 rounded w-3/4" />
      </div>

      {/* Tag row */}
      <div className="flex gap-2 mt-4">
        <div className="h-6 bg-gray-200 rounded-full w-14" />
        <div className="h-6 bg-gray-200 rounded-full w-16" />
      </div>

      {/* Attachment area */}
      <div className="flex gap-2 mt-4">
        <div className="w-20 h-20 bg-gray-200 rounded-lg" />
        <div className="w-20 h-20 bg-gray-200 rounded-lg" />
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-3">
          <div className="h-3 bg-gray-200 rounded w-16" />
          <div className="h-3 bg-gray-200 rounded w-8" />
        </div>
        <div className="h-4 w-4 bg-gray-200 rounded" />
      </div>
    </div>
  )
}
