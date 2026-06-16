/**
 * In-memory store for WhatsApp inbox backfill progress.
 * Used so GET /api/whatsapp/sync-status can report isBackfilling without blocking.
 */

let backfilling = false;
let abortRequested = false;

export function setBackfilling(value: boolean): void {
  backfilling = value;
  if (!value) abortRequested = false;
}

export function isBackfilling(): boolean {
  return backfilling;
}

export function setAbortRequested(): void {
  abortRequested = true;
}

export function isAbortRequested(): boolean {
  return abortRequested;
}

export function clearAbortRequested(): void {
  abortRequested = false;
}
