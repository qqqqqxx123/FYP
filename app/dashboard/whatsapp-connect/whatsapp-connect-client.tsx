"use client";

import { DashboardColorPicker } from "@/components/dashboard-color-picker";
import {
  getCardColorTheme,
  getWhatsAppConnectCardColorStorageKey,
  pickDistinctCardColor,
  readWhatsAppConnectCardColor,
  type CardColorId,
} from "@/lib/dashboard-card-colors";
import {
  DUPLICATE_WHATSAPP_NUMBER_MESSAGE,
  formatWhatsAppPhoneDisplay,
  getWhatsAppPhoneRegion,
} from "@/lib/whatsapp-phone";
import {
  buildNextWhatsAppSessionId,
  parseWhatsAppSlotFromSessionId,
} from "@/lib/whatsapp-session-id";
import { useCallback, useEffect, useRef, useState } from "react";

interface SlotConnection {
  slot: number;
  sessionId: string;
  status: "disconnected" | "connecting" | "waiting_qr" | "connected";
  phone?: string;
  qr?: string;
  error?: string;
}

const MAX_WHATSAPP_SLOTS = 5;

const POLL_INTERVAL_MS = 2000;
const CONNECT_REQUEST_TIMEOUT_MS = 35000;
const STATUS_REQUEST_TIMEOUT_MS = 12000;
const MAX_CONNECT_POLL_ATTEMPTS = 30;
const MAX_QR_SCAN_POLL_ATTEMPTS = 90;

function mapConnectionRecords(
  connections: Array<{
    sessionId?: string;
    phone?: string;
    status?: string;
  }>
): SlotConnection[] {
  return connections
    .filter((item) => item.sessionId)
    .map((item) => ({
      slot: parseWhatsAppSlotFromSessionId(String(item.sessionId)),
      sessionId: String(item.sessionId),
      status: item.status === "connected" ? ("connected" as const) : ("disconnected" as const),
      phone: item.phone,
    }));
}

/** Hide orphaned extra disconnected slots that should not reappear after reload. */
function filterSlotsForDisplay(slots: SlotConnection[]): SlotConnection[] {
  const sorted = [...slots].sort((a, b) => a.slot - b.slot);
  const result: SlotConnection[] = [];

  for (const slot of sorted) {
    if (slot.slot === 1) {
      result.push(slot);
      continue;
    }

    const previous = result.find((item) => item.slot === slot.slot - 1);
    if (!previous || previous.status !== "connected") {
      if (slot.status === "connected") result.push(slot);
      continue;
    }

    result.push(slot);
  }

  const lastConnectedIndex = result.reduce(
    (index, slot, currentIndex) => (slot.status === "connected" ? currentIndex : index),
    -1
  );
  if (lastConnectedIndex < 0) return result.slice(0, 1);

  const maxSlot = result[lastConnectedIndex].slot;
  const trailingDisconnected = result.filter(
    (slot) => slot.slot > maxSlot && slot.status === "disconnected"
  );

  if (trailingDisconnected.length <= 1) return result;

  const allowedTrailingSlot = trailingDisconnected[0]?.slot;
  return result.filter(
    (slot) => slot.status === "connected" || slot.slot <= maxSlot || slot.slot === allowedTrailingSlot
  );
}

export function WhatsAppConnectClient() {
  const [slots, setSlots] = useState<SlotConnection[]>([]);
  const [removingSessionId, setRemovingSessionId] = useState<string | null>(null);
  const slotsRef = useRef(slots);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollAttemptsRef = useRef(0);
  const savingConnectionRef = useRef(false);
  const connectingSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  function updateSlot(sessionId: string, patch: Partial<SlotConnection>) {
    setSlots((current) =>
      current.map((slot) => (slot.sessionId === sessionId ? { ...slot, ...patch } : slot))
    );
  }

  async function requestWhatsAppDisconnect(source: string, sessionId: string) {
    console.log("[LOGOUT REQUEST]", { source, sessionId, at: new Date().toISOString() });
    return fetch("/api/whatsapp/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, sessionId }),
    });
  }

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const rejectDuplicateConnection = useCallback(
    async (sessionId: string, message: string) => {
      stopPolling();
      try {
        await requestWhatsAppDisconnect("duplicate_phone_rejection", sessionId);
      } catch {
        // best effort
      }
      updateSlot(sessionId, {
        status: "disconnected",
        phone: undefined,
        qr: undefined,
        error: message,
      });
    },
    [stopPolling]
  );

  const applyConnected = useCallback(
    async (sessionId: string, phone: string) => {
      if (savingConnectionRef.current) return;

      const current = slotsRef.current.find((slot) => slot.sessionId === sessionId);
      if (current?.status === "connected" && current.phone === phone) {
        stopPolling();
        return;
      }

      savingConnectionRef.current = true;
      try {
        const res = await fetch("/api/whatsapp/connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, status: "connected", sessionId }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
          sessionId?: string;
        };

        if (!res.ok) {
          if (res.status === 409) {
            await rejectDuplicateConnection(
              sessionId,
              data.message ?? DUPLICATE_WHATSAPP_NUMBER_MESSAGE
            );
            return;
          }

          stopPolling();
          updateSlot(sessionId, {
            status: current?.qr ? "waiting_qr" : "connecting",
            error:
              data.message ??
              "Connected on WhatsApp but failed to save. Your session is still active — try refreshing the page.",
          });
          return;
        }

        stopPolling();
        connectingSessionIdRef.current = null;
        updateSlot(sessionId, {
          status: "connected",
          phone,
          sessionId: data.sessionId ?? sessionId,
          qr: undefined,
          error: undefined,
        });
      } finally {
        savingConnectionRef.current = false;
      }
    },
    [rejectDuplicateConnection, stopPolling]
  );

  const handleAuthFailure = useCallback(
    (sessionId: string, message: string) => {
      stopPolling();
      connectingSessionIdRef.current = null;
      updateSlot(sessionId, {
        status: "disconnected",
        phone: undefined,
        qr: undefined,
        error: message,
      });
    },
    [stopPolling]
  );

  const pollStatus = useCallback(async () => {
    const activeSessionId = connectingSessionIdRef.current;
    if (!activeSessionId) return;

    pollAttemptsRef.current += 1;
    const activeSlot = slotsRef.current.find((slot) => slot.sessionId === activeSessionId);

    try {
      const res = await fetch(
        `/api/whatsapp/status?sessionId=${encodeURIComponent(activeSessionId)}`,
        {
          signal: AbortSignal.timeout(STATUS_REQUEST_TIMEOUT_MS),
        }
      );
      const data = (await res.json().catch(() => ({}))) as {
        connected?: boolean;
        phone?: string;
        qr?: string;
        message?: string;
      };

      if (res.status === 401) {
        handleAuthFailure(
          activeSessionId,
          "Your session could not be verified. Please log out and sign in again, then retry Connect."
        );
        return;
      }

      if (!res.ok) return;

      if (data.connected && data.phone && activeSlot?.status !== "connected") {
        await applyConnected(activeSessionId, data.phone);
        return;
      }

      if (data.qr) {
        pollAttemptsRef.current = 0;
        updateSlot(activeSessionId, {
          status: "waiting_qr",
          qr: data.qr,
          error: undefined,
        });
        return;
      }

      const isWaitingForScan =
        activeSlot?.status === "waiting_qr" || Boolean(activeSlot?.qr);
      const maxAttempts = isWaitingForScan
        ? MAX_QR_SCAN_POLL_ATTEMPTS
        : MAX_CONNECT_POLL_ATTEMPTS;

      if (pollAttemptsRef.current >= maxAttempts) {
        handleAuthFailure(
          activeSessionId,
          "QR code is taking longer than expected. Click Connect to try again."
        );
        return;
      }

      const cachedConnectionsRes = await fetch(
        `/api/whatsapp/connections?sessionId=${encodeURIComponent(activeSessionId)}`
      );
      if (cachedConnectionsRes.status === 401) {
        handleAuthFailure(
          activeSessionId,
          "Your session could not be verified. Please log out and sign in again, then retry Connect."
        );
        return;
      }

      const cachedConnectionsData = (await cachedConnectionsRes.json().catch(() => ({}))) as {
        connection?: { phone?: string; status?: string };
      };
      const cached = cachedConnectionsData.connection;
      if (cached?.status === "connected" && cached.phone) {
        await applyConnected(activeSessionId, cached.phone);
      }
    } catch {
      const isWaitingForScan =
        activeSlot?.status === "waiting_qr" || Boolean(activeSlot?.qr);
      const maxAttempts = isWaitingForScan
        ? MAX_QR_SCAN_POLL_ATTEMPTS
        : MAX_CONNECT_POLL_ATTEMPTS;

      if (pollAttemptsRef.current >= maxAttempts) {
        handleAuthFailure(
          activeSessionId,
          "WhatsApp bridge is not responding. Check bridge URL/endpoints and try again."
        );
      }
    }
  }, [applyConnected, handleAuthFailure, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  useEffect(() => {
    fetch("/api/whatsapp/connections")
      .then((res) => res.json())
      .then(
        (data: {
          connections?: Array<{
            sessionId?: string;
            phone?: string;
            status?: string;
          }>;
          connection?: { sessionId?: string; phone?: string; status?: string };
        }) => {
          const connections =
            data.connections && data.connections.length > 0
              ? data.connections
              : data.connection
                ? [data.connection]
                : [];

          const mapped = filterSlotsForDisplay(mapConnectionRecords(connections));

          if (mapped.length > 0) {
            setSlots(mapped);
            return;
          }

          if (data.connection?.sessionId) {
            setSlots(
              filterSlotsForDisplay(
                mapConnectionRecords([
                  {
                    sessionId: data.connection.sessionId,
                    phone: data.connection.phone,
                    status: data.connection.status,
                  },
                ])
              )
            );
          }
        }
      )
      .catch(() => {});
  }, []);

  function startPolling(sessionId: string) {
    connectingSessionIdRef.current = sessionId;
    pollAttemptsRef.current = 0;
    pollStatus();
    pollingRef.current = setInterval(() => pollStatus(), POLL_INTERVAL_MS);
  }

  async function handleConnect(sessionId: string) {
    updateSlot(sessionId, { status: "connecting", error: undefined, qr: undefined });
    stopPolling();
    pollAttemptsRef.current = 0;
    try {
      const res = await fetch("/api/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
        signal: AbortSignal.timeout(CONNECT_REQUEST_TIMEOUT_MS),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        started?: boolean;
        qr?: string;
        phone?: string;
      };
      if (!res.ok) {
        const errorMessage =
          res.status === 401
            ? "Your session could not be verified. Please log out and sign in again, then retry Connect."
            : (data.message ?? "Connect failed");
        updateSlot(sessionId, {
          status: "disconnected",
          error: errorMessage,
        });
        return;
      }
      if (data.phone) {
        await applyConnected(sessionId, data.phone);
        return;
      }
      const qrFromStart = data.qr;
      updateSlot(sessionId, {
        status: qrFromStart ? "waiting_qr" : "connecting",
        ...(qrFromStart ? { qr: qrFromStart } : {}),
      });
      startPolling(sessionId);
    } catch {
      updateSlot(sessionId, {
        status: "disconnected",
        error: "WhatsApp bridge is not responding. Check bridge URL/endpoints and try again.",
      });
    }
  }

  async function handleDisconnect(
    sessionId: string,
    source: "user_disconnect_button" | "user_cancel_button"
  ) {
    console.log("[LOGOUT REQUEST]", { source, sessionId, at: new Date().toISOString() });
    stopPolling();
    connectingSessionIdRef.current = null;

    try {
      const res = await requestWhatsAppDisconnect(source, sessionId);
      const data = (await res.json().catch(() => ({}))) as { message?: string };

      if (!res.ok) {
        updateSlot(sessionId, {
          error: data.message ?? "Disconnect failed. Please try again.",
        });
        return;
      }

      updateSlot(sessionId, {
        status: "disconnected",
        phone: undefined,
        qr: undefined,
        error: undefined,
      });
    } catch {
      updateSlot(sessionId, {
        error: "Disconnect failed. Please check the bridge and try again.",
      });
    }
  }

  function handleAddSlot() {
    const lastSlot = slots[slots.length - 1];
    if (!lastSlot || lastSlot.status !== "connected") {
      if (lastSlot) {
        updateSlot(lastSlot.sessionId, {
          error: `Connect session ${lastSlot.slot} before adding another WhatsApp account.`,
        });
      }
      return;
    }

    if (slots.length >= MAX_WHATSAPP_SLOTS) return;

    const slot1 = slots.find((slot) => slot.slot === 1);
    if (!slot1) return;

    const nextSlot = Math.max(...slots.map((slot) => slot.slot), 1) + 1;
    const newSessionId = buildNextWhatsAppSessionId(slot1.sessionId, nextSlot);

    const usedColors = slots
      .map((slot) =>
        readWhatsAppConnectCardColor(slot.sessionId, { useLegacySlot1Key: slot.slot === 1 }),
      )
      .filter((colorId): colorId is CardColorId => colorId !== null);
    const newColorId = pickDistinctCardColor(usedColors);
    window.localStorage.setItem(getWhatsAppConnectCardColorStorageKey(newSessionId), newColorId);

    setSlots((current) => [
      ...current,
      {
        slot: nextSlot,
        sessionId: newSessionId,
        status: "disconnected",
      },
    ]);
  }

  async function handleRemoveSlot(sessionId: string) {
    const targetSlot = slots.find((slot) => slot.sessionId === sessionId);
    if (!targetSlot || targetSlot.slot === 1 || targetSlot.status !== "disconnected") return;

    const lastSlotEntry = slots[slots.length - 1];
    if (!lastSlotEntry || lastSlotEntry.sessionId !== sessionId) return;

    setRemovingSessionId(sessionId);
    try {
      const res = await fetch(
        `/api/whatsapp/connections?sessionId=${encodeURIComponent(sessionId)}`,
        { method: "DELETE" }
      );
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        updateSlot(sessionId, {
          error: data.message ?? "Failed to remove this WhatsApp slot. Please try again.",
        });
        return;
      }

      window.localStorage.removeItem(getWhatsAppConnectCardColorStorageKey(sessionId));
      setSlots((current) => current.filter((slot) => slot.sessionId !== sessionId));
    } catch {
      updateSlot(sessionId, {
        error: "Failed to remove this WhatsApp slot. Please try again.",
      });
    } finally {
      setRemovingSessionId((current) => (current === sessionId ? null : current));
    }
  }

  const lastSlot = slots[slots.length - 1];
  const canAddSlot = lastSlot?.status === "connected" && slots.length < MAX_WHATSAPP_SLOTS;
  const lastSlotSessionId = lastSlot?.sessionId;

  return (
    <section className="flex flex-wrap items-stretch justify-center gap-3">
      {slots.map((slot) => (
        <WhatsAppConnectionCard
          key={slot.sessionId}
          slot={slot}
          showAddButton={slot.sessionId === lastSlotSessionId && slots.length < MAX_WHATSAPP_SLOTS}
          canAddSlot={canAddSlot}
          addButtonHint={
            lastSlot
              ? `Connect session ${lastSlot.slot} before adding another account`
              : "Connect the current session before adding another account"
          }
          showRemoveButton={
            slot.slot > 1 &&
            slot.status === "disconnected" &&
            slot.sessionId === lastSlotSessionId
          }
          isRemovingSlot={removingSessionId === slot.sessionId}
          onRemove={() => handleRemoveSlot(slot.sessionId)}
          onAddSlot={handleAddSlot}
          onConnect={() => handleConnect(slot.sessionId)}
          onDisconnect={(source) => handleDisconnect(slot.sessionId, source)}
        />
      ))}
    </section>
  );
}

function CardHeaderWave() {
  return (
    <svg
      className="absolute bottom-0 left-0 h-5 w-full text-white"
      viewBox="0 0 1440 56"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M0,40 C240,8 480,8 720,32 C960,56 1200,56 1440,32 L1440,56 L0,56 Z"
      />
    </svg>
  );
}

function LocationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function getRegionBadgeClass(region: "Hong Kong" | "Outside Hong Kong"): string {
  if (region === "Hong Kong") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-pink-200 bg-pink-50 text-pink-800";
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function getConnectionStatusLabel(status: SlotConnection["status"]): string {
  if (status === "connected") return "Connected";
  if (status === "waiting_qr") return "Scan QR code";
  if (status === "connecting") return "Connecting";
  return "Not connected";
}

function WhatsAppConnectionCard({
  slot,
  showAddButton,
  canAddSlot,
  addButtonHint,
  showRemoveButton,
  isRemovingSlot,
  onAddSlot,
  onRemove,
  onConnect,
  onDisconnect,
}: {
  slot: SlotConnection;
  showAddButton: boolean;
  canAddSlot: boolean;
  addButtonHint: string;
  showRemoveButton: boolean;
  isRemovingSlot: boolean;
  onAddSlot: () => void;
  onRemove: () => void;
  onConnect: () => void;
  onDisconnect: (source: "user_disconnect_button" | "user_cancel_button") => void;
}) {
  const { status, phone, qr, error } = slot;
  const isConnected = status === "connected";
  const [colorId, setColorId] = useState<CardColorId>("emerald");

  useEffect(() => {
    const saved = readWhatsAppConnectCardColor(slot.sessionId, {
      useLegacySlot1Key: slot.slot === 1,
    });
    if (saved) {
      setColorId(saved);
      return;
    }

    const defaultColor: CardColorId = "emerald";
    setColorId(defaultColor);
    window.localStorage.setItem(
      getWhatsAppConnectCardColorStorageKey(slot.sessionId),
      defaultColor,
    );
  }, [slot.sessionId, slot.slot]);

  const theme = getCardColorTheme(colorId);
  const displayPhone = phone ? formatWhatsAppPhoneDisplay(phone) : "";
  const phoneRegion = phone ? getWhatsAppPhoneRegion(phone) : null;

  function handleColorChange(nextColorId: CardColorId) {
    setColorId(nextColorId);
    window.localStorage.setItem(
      getWhatsAppConnectCardColorStorageKey(slot.sessionId),
      nextColorId,
    );
  }

  return (
    <div className="relative flex h-full w-full max-w-[19.6rem] shrink-0 flex-col">
      <article className="relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-slate-200/70 bg-white/80 shadow-xl shadow-slate-900/10 backdrop-blur-sm">
      {isRemovingSlot ? (
        <div
          className="absolute inset-0 z-40 flex flex-col items-center justify-center rounded-xl bg-white/75 backdrop-blur-sm"
          aria-busy="true"
          aria-live="polite"
        >
          <span
            className="h-8 w-8 animate-spin rounded-full border-[3px] border-slate-200 border-t-red-600"
            aria-hidden
          />
          <p className="mt-2.5 text-xs font-semibold text-slate-600">Removing slot…</p>
        </div>
      ) : null}
      {showRemoveButton ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={isRemovingSlot}
          aria-label="Remove this WhatsApp slot"
          title="Remove this WhatsApp slot"
          className="absolute right-2 top-2 z-30 inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-200 bg-white text-red-600 shadow-sm transition hover:bg-red-50 disabled:pointer-events-none disabled:opacity-60 sm:h-8 sm:w-8"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      ) : null}
      <div
        className={`relative flex h-[5.5rem] shrink-0 flex-col justify-end px-3 pb-7 pt-2 text-center text-white sm:h-[5.75rem] ${theme.header}`}
      >
        <div className="relative z-10 mx-auto w-full px-0.5">
          <p className="text-[0.5rem] font-semibold uppercase tracking-[0.18em] text-white/75 sm:text-[0.55rem]">
            AI.S.D.S.
          </p>
          <h3 className="mt-0.5 line-clamp-2 w-full text-[0.68rem] font-bold uppercase leading-snug tracking-wide sm:text-xs">
            WhatsApp Connect{slot.slot > 1 ? ` #${slot.slot}` : ""}
          </h3>
        </div>
        <CardHeaderWave />
      </div>

      <div className="relative z-10 -mt-3 flex flex-1 flex-col rounded-t-2xl bg-white px-3 pb-3.5 pt-3">
        <div className="mb-2.5 flex flex-wrap items-center justify-center gap-1">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[0.6rem] font-semibold ${theme.badge}`}
          >
            <WhatsAppIcon className="h-3 w-3" />
            {getConnectionStatusLabel(status)}
          </span>
        </div>

        {status !== "connected" && qr ? (
          <div className="mb-3 text-center">
            <p className={`mb-1.5 text-[0.6rem] font-bold uppercase tracking-wider ${theme.accent}`}>
              QR Code
            </p>
            <div className="mx-auto inline-block overflow-hidden rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm">
              <img src={qr} alt="Scan with WhatsApp" className="h-28 w-28 sm:h-32 sm:w-32" />
            </div>
            <p className="mt-1 text-[0.65rem] text-slate-500">Scan with WhatsApp on your phone</p>
          </div>
        ) : null}

        {(status === "connecting" || status === "waiting_qr") && !qr ? (
          <p className="mb-3 text-left text-xs text-amber-600">Generating QR code…</p>
        ) : null}

        <div className="text-left">
          <p className={`text-[0.6rem] font-bold uppercase tracking-wider ${theme.accent}`}>
            Contact Detail
          </p>
          {isConnected && displayPhone ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-700">
              <WhatsAppIcon className="h-3.5 w-3.5 shrink-0 text-[#25D366]" />
              <span>{displayPhone}</span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-700">Not connected</p>
          )}
        </div>

        <div className="mt-2.5 text-left">
          <p className={`text-[0.6rem] font-bold uppercase tracking-wider ${theme.accent}`}>
            Region
          </p>
          {isConnected && phoneRegion ? (
            <span
              className={`mt-1 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[0.6rem] font-semibold ${getRegionBadgeClass(phoneRegion)}`}
            >
              <LocationIcon className="h-3 w-3" />
              {phoneRegion}
            </span>
          ) : (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[0.6rem] font-semibold text-slate-400">
              <LocationIcon className="h-3 w-3" />
              —
            </span>
          )}
        </div>

        <div className="mt-2.5 text-left">
          <DashboardColorPicker
            value={colorId}
            onChange={handleColorChange}
            label="Card color"
            labelClassName={`text-[0.6rem] font-bold uppercase tracking-wider ${theme.accent}`}
          />
        </div>

        {error ? (
          <p className="mt-3 text-left text-xs text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-auto space-y-1.5 pt-3">
          {status === "disconnected" ? (
            <button
              type="button"
              onClick={onConnect}
              className="w-full rounded-md bg-amber-400 px-2 py-1.5 text-[0.6rem] font-bold uppercase tracking-wide text-slate-900 transition hover:bg-amber-500 sm:text-[0.65rem]"
            >
              Connect
            </button>
          ) : null}
          {status === "connecting" || status === "waiting_qr" ? (
            <button
              type="button"
              onClick={() => onDisconnect("user_cancel_button")}
              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[0.6rem] font-bold uppercase tracking-wide text-slate-700 transition hover:bg-slate-50 sm:text-[0.65rem]"
            >
              Cancel
            </button>
          ) : null}
          {status === "connected" ? (
            <button
              type="button"
              onClick={() => onDisconnect("user_disconnect_button")}
              className="w-full rounded-md bg-red-500 px-2 py-1.5 text-[0.6rem] font-bold uppercase tracking-wide text-white transition hover:bg-red-600 sm:text-[0.65rem]"
            >
              Disconnect
            </button>
          ) : null}
        </div>
      </div>
    </article>
      {showAddButton ? (
        <button
          type="button"
          onClick={onAddSlot}
          disabled={!canAddSlot}
          aria-label="Add another WhatsApp account"
          title={
            canAddSlot ? "Add another WhatsApp account" : addButtonHint
          }
          className="absolute left-full top-1/2 z-10 ml-8 inline-flex h-16 w-16 -translate-y-1/2 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-slate-700 shadow-md transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <PlusIcon className="h-8 w-8" />
        </button>
      ) : null}
    </div>
  );
}
