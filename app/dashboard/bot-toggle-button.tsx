"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_MS = 2000;

function BotIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}

export interface ProgressState {
  targetEnabled: boolean;
  total: number;
  updated: number;
}

export interface BotToggleButtonProps {
  /** Called when toggle starts (progress) or finishes. Parent can show progress and block other actions until finished. */
  onProgressChange?: (inProgress: boolean, progress?: ProgressState) => void;
}

export function BotToggleButton({ onProgressChange }: BotToggleButtonProps) {
  const [enabled, setEnabled] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const applyStatusResponse = useCallback(
    (data: Record<string, unknown>) => {
      if (data.inProgress === true && typeof data.targetEnabled === "boolean") {
        const next: ProgressState = {
          targetEnabled: data.targetEnabled as boolean,
          total: Number(data.total) || 0,
          updated: Number(data.updated) || 0,
        };
        setProgress(next);
        onProgressChange?.(true, next);
      } else {
        setProgress(null);
        setEnabled((data.enabled as boolean) ?? false);
        onProgressChange?.(false);
      }
    },
    [onProgressChange]
  );

  const fetchStatus = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/woztell/channel/bot", {
        cache: "no-store",
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setEnabled(false);
        setProgress(null);
        return;
      }
      applyStatusResponse(data);
    } catch {
      setEnabled(false);
      setProgress(null);
    }
  }, [applyStatusResponse]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Poll while server reports inProgress; when server returns enabled (done), stop.
  useEffect(() => {
    if (progress === null) return;
    const tick = async () => {
      try {
        const res = await fetch("/api/woztell/channel/bot", {
          cache: "no-store",
          credentials: "include",
        });
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (res.ok) applyStatusResponse(data);
      } catch {
        // keep polling
      }
    };
    pollRef.current = setInterval(tick, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [progress, applyStatusResponse]);

  const handleClick = useCallback(async () => {
    const next = !enabled;
    setLoading(true);
    setError(null);
    setProgress(null);
    try {
      const res = await fetch("/api/woztell/channel/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
        cache: "no-store",
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setError((data.error as string) ?? "Failed to update");
        return;
      }
      if (res.status === 202) {
        const initial: ProgressState = { targetEnabled: next, total: 0, updated: 0 };
        setProgress(initial);
        onProgressChange?.(true, initial);
      } else {
        setEnabled((data.enabled as boolean) ?? next);
        const failed = Number(data.failed) || 0;
        if (failed > 0) {
          setError(`${data.updated ?? 0}/${data.total ?? 0} updated`);
        }
        await fetchStatus();
      }
    } catch {
      setError("Failed to update");
    } finally {
      setLoading(false);
    }
  }, [enabled, fetchStatus, onProgressChange]);

  const isOn = enabled === true;
  const inProgress = progress !== null;
  const percent =
    progress && progress.total > 0
      ? Math.round((progress.updated / progress.total) * 100)
      : 0;

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={`flex h-[14.4rem] w-[14.4rem] flex-col items-center justify-center gap-3 rounded-xl border shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          isOn
            ? "border-emerald-300 bg-emerald-50 text-emerald-600 hover:border-emerald-400 hover:bg-emerald-100"
            : "border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:bg-slate-50"
        }`}
        title={
          inProgress
            ? `Turning ${progress?.targetEnabled ? "on" : "off"}… ${progress?.updated ?? 0}/${progress?.total ?? 0} (${percent}%) — you can use other links`
            : isOn
              ? "AI Chatbot ON (click to turn OFF)"
              : "AI Chatbot OFF (click to turn ON)"
        }
      >
        {loading ? (
          <span className="h-[9rem] w-[9rem] animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" aria-hidden />
        ) : (
          <BotIcon className={`h-[9rem] w-[9rem] ${isOn ? "text-emerald-600" : "text-slate-400"}`} />
        )}
        <span className="text-center text-sm font-medium leading-tight">
          AI Chatbot
        </span>
        <span className={`text-xs font-medium ${isOn ? "text-emerald-600" : "text-slate-400"}`}>
          {loading ? "Sending…" : isOn ? "ON" : "OFF"}
        </span>
        {inProgress && (
          <span className="text-[10px] text-slate-500">
            Turning {progress.targetEnabled ? "on" : "off"}… {progress.updated}/{progress.total} ({percent}%)
          </span>
        )}
      </button>
      {error && !/too many request|rate limit/i.test(error) && (
        <p className="max-w-[14.4rem] text-center text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
