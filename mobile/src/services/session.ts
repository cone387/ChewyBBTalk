/** Shared by auth, cache and Redux without depending on any of them. */
export interface Session {
  scope: string | null;
  generation: number;
}
let session: Session = { scope: null, generation: 0 };
const listeners = new Set<() => void>();

export function getSession(): Session { return session; }

export function setSession(server: string, userId: string | number): void {
  const scope = JSON.stringify([server.replace(/\/+$/, ''), String(userId)]);
  if (scope === session.scope) return;
  session = { scope, generation: session.generation + 1 };
  listeners.forEach(listener => listener());
}

export function clearSession(): void {
  session = { scope: null, generation: session.generation + 1 };
  listeners.forEach(listener => listener());
}

export function onSessionChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function isCurrentSession(snapshot: Session): boolean {
  return snapshot.generation === session.generation;
}
