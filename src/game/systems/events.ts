import type { EventKind, GameEvent, GameState, MessageParams } from '../core/types';
import { EVENT_LOG_LIMIT } from '../data/balance';

/** Appends a player-readable entry to the bounded event log (UI turns these into notifications). */
export function logEvent(
  s: GameState,
  kind: EventKind,
  key: GameEvent['key'],
  params?: MessageParams,
  at?: { x: number; y: number },
): void {
  const event: GameEvent = { id: s.nextEventId++, tick: s.tick, kind, key };
  if (params) event.params = params;
  if (at) event.at = at;
  s.eventLog.push(event);
  if (s.eventLog.length > EVENT_LOG_LIMIT) s.eventLog.splice(0, s.eventLog.length - EVENT_LOG_LIMIT);
}
