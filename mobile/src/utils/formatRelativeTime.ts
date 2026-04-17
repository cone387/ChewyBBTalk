/**
 * 计算相对时间文本。
 * 将 ISO 时间戳转换为"X 分钟前"、"X 小时前"等人类可读格式。
 */
export function formatRelativeTime(isoTimestamp: string): string {
  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();

  if (isNaN(then)) {
    return '未知时间';
  }

  const diffMs = now - then;

  // 未来时间或刚刚
  if (diffMs < 0) {
    return '刚刚';
  }

  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) {
    return '刚刚';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`;
  }
  if (diffHours < 24) {
    return `${diffHours} 小时前`;
  }
  return `${diffDays} 天前`;
}
