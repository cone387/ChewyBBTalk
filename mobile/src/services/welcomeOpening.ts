import { welcomeApi, type WelcomeQuote } from './api/welcomeApi';
import { isCurrentSession, onSessionChange, type Session } from './session';

interface Opening { generation: number; quote: Promise<WelcomeQuote | null>; dismissed: boolean; }
let opening: Opening | undefined;
onSessionChange(() => { opening = undefined; });

export function welcomeOpeningDismissed(session: Session): boolean {
  return opening?.generation === session.generation && opening.dismissed;
}

export function getWelcomeOpening(session: Session): Opening {
  if (opening?.generation === session.generation) return opening;
  if (!session.scope || !isCurrentSession(session)) {
    return { generation: session.generation, quote: Promise.resolve(null), dismissed: true };
  }
  const quote = new Promise<WelcomeQuote | null>(resolve => {
    const timeout = setTimeout(() => resolve(null), 5000);
    welcomeApi.next().then(result => resolve(isCurrentSession(session) ? result.quote : null)).catch(() => resolve(null))
      .finally(() => clearTimeout(timeout));
  });
  opening = { generation: session.generation, quote, dismissed: false };
  return opening;
}

export function dismissWelcomeOpening(session: Session): void {
  if (isCurrentSession(session) && opening?.generation === session.generation) opening.dismissed = true;
}
