/**
 * In-memory progress for background bot toggle.
 * GET /api/woztell/channel/bot reads this to return inProgress + total/updated.
 */

export interface BotToggleProgress {
  targetEnabled: boolean;
  total: number;
  updated: number;
}

let current: BotToggleProgress | null = null;

export function getBotToggleProgress(): BotToggleProgress | null {
  return current;
}

export function setBotToggleProgress(p: BotToggleProgress | null): void {
  current = p;
}

export function incrementBotToggleUpdated(): void {
  if (current) current.updated += 1;
}
