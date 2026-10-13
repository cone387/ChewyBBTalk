let pending: Promise<unknown> = Promise.resolve();
export function serializeOutboxWrite<T>(work: () => Promise<T>): Promise<T> {
  const operation = pending.catch(() => {}).then(work);
  pending = operation.catch(() => {});
  return operation;
}
export async function waitForOutboxWrites() { await pending; }
