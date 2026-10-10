/** Convert business errors and FastAPI 422 details into safe, readable text. */
export function apiErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback;
  const error = data as Record<string, unknown>;
  for (const value of [error.error, error.message, error.detail]) {
    if (typeof value === 'string' && value) return value;
  }
  if (Array.isArray(error.detail)) {
    const messages = error.detail.flatMap((item: unknown) => {
      if (!item || typeof item !== 'object') return [];
      const detail = item as { loc?: unknown; msg?: unknown };
      if (typeof detail.msg !== 'string') return [];
      const location = Array.isArray(detail.loc)
        ? detail.loc.filter(part => typeof part === 'string' || typeof part === 'number')
          .filter((part, index) => index !== 0 || !['body', 'query', 'path', 'header'].includes(String(part))).join('.')
        : '';
      return [location ? `${location}: ${detail.msg}` : detail.msg];
    });
    if (messages.length) return messages.join('；');
  }
  return fallback;
}
