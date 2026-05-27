/**
 * Centralized event logger for Copilot Toolkit.
 * Stores events in memory (session) and optionally persists to globalState.
 */
import * as vscode from 'vscode';

// ─── Event types ──────────────────────────────────────────────────────────────

export type EventType =
  | 'fix_suggested'
  | 'fix_applied'
  | 'fix_rejected'
  | 'feedback'
  | 'pattern_detected'
  | 'fix_validated'
  | 'edit_detected'
  | 'suggestion_sent';

export interface LoggedEvent {
  id: string;
  type: EventType;
  timestamp: number;
  fileName?: string;
  languageId?: string;
  patternName?: string;
  feedbackPositive?: boolean;
  fixId?: string;
  meta?: Record<string, unknown>;
}

// ─── In-memory store ──────────────────────────────────────────────────────────

const SESSION_EVENTS: LoggedEvent[] = [];
const PERSISTED_KEY = 'copilotToolkit.eventLog';
const MAX_PERSISTED  = 1000;

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Core logger ──────────────────────────────────────────────────────────────

export function logEvent(
  type: EventType,
  extras: Partial<Omit<LoggedEvent, 'id' | 'type' | 'timestamp'>> = {}
): LoggedEvent {
  const event: LoggedEvent = {
    id: makeId(),
    type,
    timestamp: Date.now(),
    ...extras,
  };
  SESSION_EVENTS.push(event);
  return event;
}

/** All events in the current session. */
export function getSessionEvents(): ReadonlyArray<LoggedEvent> {
  return SESSION_EVENTS;
}

/** Events of a specific type. */
export function getEventsByType(type: EventType): LoggedEvent[] {
  return SESSION_EVENTS.filter(e => e.type === type);
}

// ─── Persistence (globalState) ────────────────────────────────────────────────

export async function flushToState(state: vscode.Memento): Promise<void> {
  const existing = state.get<LoggedEvent[]>(PERSISTED_KEY, []);
  const combined = [...existing, ...SESSION_EVENTS].slice(-MAX_PERSISTED);
  await state.update(PERSISTED_KEY, combined);
}

export function loadPersistedEvents(state: vscode.Memento): LoggedEvent[] {
  return state.get<LoggedEvent[]>(PERSISTED_KEY, []);
}

export async function clearPersistedEvents(state: vscode.Memento): Promise<void> {
  SESSION_EVENTS.length = 0;
  await state.update(PERSISTED_KEY, []);
}

// ─── Aggregation helpers (used by metrics engine) ────────────────────────────

export function countByType(events: LoggedEvent[], type: EventType): number {
  return events.filter(e => e.type === type).length;
}

export function positiveFeedbackCount(events: LoggedEvent[]): number {
  return events.filter(e => e.type === 'feedback' && e.feedbackPositive === true).length;
}

export function totalFeedbackCount(events: LoggedEvent[]): number {
  return events.filter(e => e.type === 'feedback').length;
}
