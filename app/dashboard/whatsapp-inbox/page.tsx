"use client";

import { DashboardPageBanner } from "@/components/dashboard-page-banner";
import {
  AI_SCAM_DETECT_AGENT_DISPLAY_NAME,
  formatWhatsAppPhoneDisplay,
  isAiScamDetectAgentContact,
} from "@/lib/whatsapp-phone";
import { parseWhatsAppSlotFromSessionId } from "@/lib/whatsapp-session-id";
import { useDashboardHeaderColor } from "@/lib/use-dashboard-header-color";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const WHATSAPP_INBOX_SESSION_STORAGE_KEY = "whatsapp-inbox-active-session";

const CONVERSATIONS_POLL_MS = 5000;
const BACKFILL_STEPPER_MS = 1800;
const BACKFILL_STEPPER_TEXTS = [
  "Connecting…",
  "Fetching conversations…",
  "Syncing messages…",
  "Finalizing…",
] as const;
const BACKFILL_TOAST_AUTO_DISMISS_MS = 6000;
const MESSAGES_POLL_MS = 5000;
/** Poll interval for sync-status (matches NocoDB refresh cadence). */
const SYNC_STATUS_POLL_MS = 5000;
/** Poll interval for sync-status when overlay is hidden (header display). */
const SYNC_DISPLAY_POLL_MS = 60_000;

interface WhatsAppInboxSession {
  sessionId: string;
  slot: number;
  phone?: string;
  status: string;
}

function withSessionId(path: string, sessionId: string | null): string {
  if (!sessionId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}sessionId=${encodeURIComponent(sessionId)}`;
}

function getInboxSessionLabel(session: WhatsAppInboxSession): string {
  const phone = session.phone ? formatWhatsAppPhoneDisplay(session.phone) : "";
  return phone ? `WhatsApp · ${phone}` : "WhatsApp";
}

const WHATSAPP_WALLPAPER_CLASS = "bg-[#efeae2]";
const whatsAppWallpaperStyle = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4cfc7' fill-opacity='0.35'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
} as const;
const INBOX_SIDEBAR_LIST_CLASS = "bg-white/15 backdrop-blur-sm";
const INBOX_SHELL_CLASS = "bg-white/60 shadow-xl shadow-emerald-100/40 backdrop-blur-md";

/** Format timestamp for list row: "18:01", "Saturday 18:45", or "Friday 23:41". */
function formatListTime(updatedAt?: string): string {
  if (!updatedAt) return "";
  const n = Number(updatedAt);
  if (Number.isNaN(n) || n <= 0) return updatedAt;
  const d = new Date(n > 1e12 ? n : n * 1000);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const isYesterday = new Date(now.getTime() - 864e5).toDateString() === d.toDateString();
  if (isYesterday) return "Yesterday " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

/** Format message time: "17:59". */
function formatMessageTimeShort(createdAt?: string): string {
  if (!createdAt) return "";
  const n = Number(createdAt);
  if (!Number.isNaN(n) && n > 0) {
    const d = new Date(n > 1e12 ? n : n * 1000);
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return createdAt;
}

/** Ordinal suffix for day: 1st, 2nd, 3rd, 4th. */
function ordinal(day: number): string {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

/** Format full date for divider: "Mon, February 2nd 2026". */
function formatDateDivider(createdAt: string): string {
  const n = Number(createdAt);
  if (Number.isNaN(n) || n <= 0) return createdAt;
  const d = new Date(n > 1e12 ? n : n * 1000);
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
  const month = d.toLocaleDateString(undefined, { month: "long" });
  const day = d.getDate();
  const year = d.getFullYear();
  return `${weekday}, ${month} ${day}${ordinal(day)} ${year}`;
}

const MESSAGES_NEAR_BOTTOM_PX = 96;

function isMessagesNearBottom(container: HTMLElement): boolean {
  const distanceFromBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight;
  return distanceFromBottom <= MESSAGES_NEAR_BOTTOM_PX;
}

function scrollMessagesToBottom(container: HTMLElement, behavior: ScrollBehavior) {
  container.scrollTo({ top: container.scrollHeight, behavior });
}

interface SyncStatusPayload {
  isBackfilling: boolean;
  latestDbMessageTs: number | null;
  caughtUpToToday: boolean;
  thresholdMs: number;
  updatedAt: number;
  progress?: { stage: string; percent?: number };
  error?: string;
}

/** Format ms since epoch to local datetime string for overlay; "none" when null. */
function formatSyncStatusTime(ms: number | null): string {
  if (ms == null) return "none";
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

/**
 * Full-page overlay shown while initial load + backfill and DB is not yet "caught up to today".
 * Disappears when sync-status reports caughtUpToToday === true (or when conversations load completes).
 */
function BackfillOverlay({
  syncStatus,
  onStop,
}: {
  syncStatus: SyncStatusPayload | null;
  onStop?: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setStepIndex((i) => (i + 1) % BACKFILL_STEPPER_TEXTS.length);
    }, BACKFILL_STEPPER_MS);
    return () => clearInterval(id);
  }, []);
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-slate-50/95 px-6"
      role="status"
      aria-live="polite"
      aria-label="Backfilling conversations"
    >
      <p className="text-center text-lg font-medium text-slate-800">
        Backfilling…
      </p>
      <p className="min-h-[1.5rem] text-center text-sm text-slate-600 transition-opacity duration-300">
        {BACKFILL_STEPPER_TEXTS[stepIndex]}
      </p>
      <div className="w-full max-w-xs">
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-valuenow={undefined}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Backfill in progress"
        >
          <div
            className="h-full w-full rounded-full bg-emerald-500 animate-backfill-progress"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgb(16 185 129) 40%, rgb(16 185 129) 60%, transparent 100%)",
              backgroundSize: "200% 100%",
            }}
          />
        </div>
      </div>
      {syncStatus && (
        <div className="w-full max-w-xs space-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600">
          <p>Update time: {formatSyncStatusTime(syncStatus.updatedAt)}</p>
          <p>Latest DB message: {formatSyncStatusTime(syncStatus.latestDbMessageTs)}</p>
          <p>Caught up: {syncStatus.caughtUpToToday ? "Yes" : "No"}</p>
        </div>
      )}
      <p className="text-center text-xs text-slate-500">
        This may take a few minutes on first sync.
      </p>
      {onStop && (
        <button
          type="button"
          onClick={onStop}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Stop
        </button>
      )}
    </div>
  );
}

function normalizePhone(p: string): string {
  return (p ?? "").replace(/\D/g, "");
}

interface Conversation {
  id: string;
  name?: string;
  lastMessage?: string;
  updatedAt?: string;
  phone?: string;
  isGroup?: boolean;
  /** Placeholder unread count until API supports it. */
  unreadCount?: number;
}

interface Message {
  id: string;
  conversationId: string;
  text?: string;
  imageUrl?: string;
  voiceUrl?: string;
  fromMe?: boolean;
  createdAt?: string;
  scamPercentage?: number;
  scamDescription?: string;
  senderName?: string;
}

/** Load NocoDB/S3 media in the browser; private buckets go through the photos proxy. */
function getInboxMediaSrc(url: string): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (/X-Amz-Signature=/i.test(trimmed) && /X-Amz-Expires=/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) {
    return `/api/photos/proxy?url=${encodeURIComponent(trimmed)}`;
  }
  if (
    trimmed.includes("amazonaws.com") ||
    (trimmed.includes("s3.") && trimmed.includes("nocohub")) ||
    trimmed.includes("nocodb")
  ) {
    return `/api/photos/proxy?url=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}

function shouldShowMessageText(message: Message): boolean {
  const text = message.text?.trim();
  if (!text) return false;
  if (message.imageUrl && /^\[image\]/i.test(text)) return false;
  if (message.voiceUrl && /^\[voice message\]/i.test(text)) return false;
  return true;
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function AiAgentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h3a3 3 0 0 1 3 3v2h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1v-2a3 3 0 0 1 3-3h3V5.73A2 2 0 0 1 12 2zm0 2a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1zM7 9a1 1 0 0 0-1 1v6h12v-6a1 1 0 0 0-1-1H7zm2 3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z" />
    </svg>
  );
}

function GroupPeopleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
    </svg>
  );
}

function isAiAgentConversation(conversation: { id?: string; phone?: string } | null | undefined) {
  if (!conversation) return false;
  return (
    isAiScamDetectAgentContact(conversation.phone) ||
    isAiScamDetectAgentContact(conversation.id)
  );
}

function ConversationAvatar({
  conversation,
  tone = "default",
}: {
  conversation: { id?: string; phone?: string; isGroup?: boolean } | null | undefined;
  tone?: "default" | "onColor";
}) {
  const onColor = tone === "onColor";

  if (isAiAgentConversation(conversation)) {
    return (
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          onColor
            ? "bg-violet-400/35 text-white ring-2 ring-white/40"
            : "bg-violet-100 text-violet-700 ring-2 ring-violet-200/80"
        }`}
        aria-hidden
      >
        <AiAgentIcon className="h-5 w-5" />
      </span>
    );
  }

  if (conversation?.isGroup) {
    return (
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          onColor
            ? "bg-white/20 text-white ring-2 ring-white/40"
            : "bg-sky-100 text-sky-700 ring-2 ring-sky-200/80"
        }`}
        aria-hidden
      >
        <GroupPeopleIcon className="h-5 w-5" />
      </span>
    );
  }

  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
        onColor
          ? "bg-white/20 text-white ring-2 ring-white/40"
          : "bg-emerald-100 text-emerald-700 ring-2 ring-emerald-200/80"
      }`}
      aria-hidden
    >
      <WhatsAppIcon className="h-5 w-5" />
    </span>
  );
}

function HighScamRiskIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
  );
}

function getScamRiskColorClass(scamPct: number): string {
  if (scamPct > 75) return "text-red-600";
  if (scamPct >= 50) return "text-amber-700";
  return "text-emerald-600";
}

function formatWhatsAppReportText(text: string) {
  return text.split(/(\*[^*]+\*)/g).map((part, index) => {
    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <strong key={index} className="font-semibold">
          {part.slice(1, -1)}
        </strong>
      );
    }
    return part;
  });
}

function ScamReportModal({
  report,
  loading,
  error,
  onClose,
}: {
  report: string;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scam-report-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-[#efeae2] shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <h2 id="scam-report-title" className="font-semibold text-slate-900">
            Scam report
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close scam report"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#00a884] border-t-transparent" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (
            <div className="rounded-lg rounded-tl-none bg-white px-3 py-2 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
              <p className="whitespace-pre-wrap break-words text-[16px] leading-relaxed text-[#111b21]">
                {formatWhatsAppReportText(report)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WhatsAppInboxPage() {
  const { headerBarStyle } = useDashboardHeaderColor();
  const [connectedSessions, setConnectedSessions] = useState<WhatsAppInboxSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contactsMap, setContactsMap] = useState<Record<string, string>>({});
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  /** Shown when we transition from backfilling to done: 'success' | 'error' | null. */
  const [backfillCompleteToast, setBackfillCompleteToast] = useState<"success" | "error" | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [messagesCursor, setMessagesCursor] = useState<string | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const isInitialMessagesScrollRef = useRef(false);
  const conversationsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Sync-status from GET /api/whatsapp/sync-status; used to hide overlay when caughtUpToToday. */
  const [syncStatus, setSyncStatus] = useState<SyncStatusPayload | null>(null);
  /** When user clicks Stop, we hide overlay immediately and stop backfill. */
  const [overlayDismissedByUser, setOverlayDismissedByUser] = useState(false);
  const [scamReportModal, setScamReportModal] = useState<{
    report: string;
    loading: boolean;
    error: string | null;
  } | null>(null);

  const activeSession = useMemo(
    () => connectedSessions.find((session) => session.sessionId === activeSessionId) ?? null,
    [connectedSessions, activeSessionId]
  );

  const handleSessionChange = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    setSelectedId(null);
    setMessages([]);
    setMessagesCursor(null);
    setHasMoreMessages(false);
    setConversations([]);
    setConversationsError(null);
    setConversationsLoading(true);
    setSyncStatus(null);
    setOverlayDismissedByUser(false);
    setBackfillCompleteToast(null);
    shouldStickToBottomRef.current = true;
    isInitialMessagesScrollRef.current = false;
    window.localStorage.setItem(WHATSAPP_INBOX_SESSION_STORAGE_KEY, sessionId);
  }, []);

  function handleMessagesScroll() {
    const container = messagesContainerRef.current;
    if (!container) return;
    shouldStickToBottomRef.current = isMessagesNearBottom(container);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadSessions() {
      setSessionsLoading(true);
      try {
        const res = await fetch("/api/whatsapp/connections", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as {
          connections?: Array<{
            sessionId?: string;
            phone?: string;
            status?: string;
          }>;
          connection?: {
            sessionId?: string;
            phone?: string;
            status?: string;
          };
        };

        const rawConnections =
          data.connections && data.connections.length > 0
            ? data.connections
            : data.connection?.sessionId
              ? [data.connection]
              : [];

        const connected = rawConnections
          .filter((item) => item.sessionId && item.status === "connected")
          .map((item) => ({
            sessionId: String(item.sessionId),
            slot: parseWhatsAppSlotFromSessionId(String(item.sessionId)),
            phone: item.phone,
            status: "connected",
          }))
          .sort((a, b) => a.slot - b.slot);

        if (cancelled) return;

        setConnectedSessions(connected);

        if (connected.length === 0) {
          setActiveSessionId(null);
          return;
        }

        const savedSessionId = window.localStorage.getItem(WHATSAPP_INBOX_SESSION_STORAGE_KEY);
        const initialSessionId =
          savedSessionId && connected.some((session) => session.sessionId === savedSessionId)
            ? savedSessionId
            : connected[0].sessionId;

        setActiveSessionId(initialSessionId);
        window.localStorage.setItem(WHATSAPP_INBOX_SESSION_STORAGE_KEY, initialSessionId);
      } catch {
        if (!cancelled) {
          setConnectedSessions([]);
          setActiveSessionId(null);
        }
      } finally {
        if (!cancelled) setSessionsLoading(false);
      }
    }

    loadSessions();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Backfill session: we consider "backfill in progress" when the initial conversations
   * request is loading and we have no conversations yet.
   */
  const initialLoadNoData = conversationsLoading && conversations.length === 0;
  const initialLoadComplete = !conversationsLoading;
  const hasNoConversations = initialLoadComplete && conversations.length === 0;

  /**
   * Show overlay until sync-status reports caughtUpToToday === true, or until user clicks Stop.
   * Skip overlay when the user simply has no conversations (empty inbox is valid).
   */
  const showOverlay =
    !overlayDismissedByUser &&
    !hasNoConversations &&
    (initialLoadNoData || (syncStatus != null && !syncStatus.caughtUpToToday));

  /** Track previous isBackfilling to detect when user-triggered sync completes. */
  const prevIsBackfillingSyncRef = useRef(false);

  /** Poll sync-status every 5s while overlay visible; slow poll when hidden. Stagger vs conversations. */
  useEffect(() => {
    if (!activeSessionId) return;

    const fetchSyncStatus = async () => {
      try {
        const res = await fetch(withSessionId("/api/whatsapp/sync-status", activeSessionId), {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as SyncStatusPayload;
        setSyncStatus(data);
      } catch {
        // Keep previous state
      }
    };
    const intervalMs = showOverlay ? SYNC_STATUS_POLL_MS : SYNC_DISPLAY_POLL_MS;
    const startDelay = setTimeout(() => {
      fetchSyncStatus();
    }, 2500);
    const id = setInterval(fetchSyncStatus, intervalMs);
    return () => {
      clearTimeout(startDelay);
      clearInterval(id);
    };
  }, [showOverlay, activeSessionId]);

  /** Auto-dismiss completion toast after a few seconds. */
  useEffect(() => {
    if (backfillCompleteToast === null) return;
    const id = setTimeout(() => setBackfillCompleteToast(null), BACKFILL_TOAST_AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [backfillCompleteToast]);

  const fetchConversations = useCallback(async (silent = false) => {
    if (!activeSessionId) {
      if (!silent) setConversationsLoading(false);
      setConversations([]);
      return;
    }

    if (!silent) setConversationsLoading(true);
    setConversationsError(null);
    try {
      const res = await fetch(
        withSessionId("/api/whatsapp/conversations?first=100", activeSessionId),
        { cache: "no-store" }
      );
      const data = (await res.json().catch(() => ({}))) as {
        conversations?: Conversation[];
        error?: string;
      };
      if (!res.ok) {
        setConversationsError(data.error ?? "Failed to load conversations");
        setConversations([]);
        return;
      }
      setConversations(data.conversations ?? []);
    } catch {
      setConversationsError("Failed to load conversations");
      setConversations([]);
    } finally {
      if (!silent) setConversationsLoading(false);
    }
  }, [activeSessionId]);

  const fetchMessages = useCallback(
    async (conversationId: string, append = false, cursor: string | null = null) => {
      if (!conversationId || !activeSessionId) return;
      if (!append) setMessagesLoading(true);
      setMessagesError(null);
      const after = append ? cursor ?? messagesCursor : undefined;
      const basePath = after
        ? `/api/whatsapp/conversations/${encodeURIComponent(conversationId)}/messages?first=100&after=${encodeURIComponent(after)}`
        : `/api/whatsapp/conversations/${encodeURIComponent(conversationId)}/messages?first=100`;
      const url = withSessionId(basePath, activeSessionId);
      try {
        const res = await fetch(url, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessagesError((data as { error?: string }).error ?? "Failed to load messages");
          if (!append) setMessages([]);
          return;
        }
        const list = (data as { messages?: Message[] }).messages ?? [];
        const pageInfo = (data as { pageInfo?: { hasNextPage?: boolean; endCursor?: string } }).pageInfo;
        if (append) {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const added = list.filter((m) => !seen.has(m.id));
            return [...prev, ...added];
          });
        } else {
          setMessages(list);
        }
        setHasMoreMessages(!!pageInfo?.hasNextPage);
        setMessagesCursor(pageInfo?.endCursor ?? null);
      } catch {
        setMessagesError("Failed to load messages");
        if (!append) setMessages([]);
      } finally {
        setMessagesLoading(false);
      }
    },
    [messagesCursor, activeSessionId]
  );

  /**
   * Detect completion: when sync (triggered by user) finishes (isBackfilling -> false).
   * Show toast and refresh conversations.
   */
  useEffect(() => {
    const was = prevIsBackfillingSyncRef.current;
    const now = syncStatus?.isBackfilling ?? false;
    prevIsBackfillingSyncRef.current = now;
    if (was && !now) {
      setBackfillCompleteToast("success");
      fetchConversations(true);
      if (selectedId) fetchMessages(selectedId, false);
    }
  }, [syncStatus?.isBackfilling, fetchConversations, fetchMessages, selectedId]);

  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/contacts", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      const contacts = (data as { contacts?: Record<string, string> }).contacts ?? {};
      setContactsMap(contacts);
    } catch {
      // Ignore - use cache/phone fallback
    }
  }, []);

  useEffect(() => {
    if (!activeSessionId) {
      setConversations([]);
      setConversationsLoading(false);
      return;
    }

    setConversations([]);
    setConversationsError(null);
    setConversationsLoading(true);
    fetchConversations();
    fetchContacts();
  }, [activeSessionId, fetchConversations, fetchContacts]);

  useEffect(() => {
    const t = setInterval(fetchContacts, CONVERSATIONS_POLL_MS * 2);
    return () => clearInterval(t);
  }, [fetchContacts]);

  useEffect(() => {
    shouldStickToBottomRef.current = true;
    isInitialMessagesScrollRef.current = true;
  }, [selectedId]);

  useEffect(() => {
    if (selectedId && activeSessionId) {
      fetchMessages(selectedId, false);
    } else {
      setMessages([]);
      setMessagesCursor(null);
      setHasMoreMessages(false);
    }
  }, [selectedId, activeSessionId, fetchMessages]);

  useEffect(() => {
    if (messagesLoading || messages.length === 0) return;

    const container = messagesContainerRef.current;
    if (!container) return;

    const behavior: ScrollBehavior = isInitialMessagesScrollRef.current ? "auto" : "smooth";
    if (isInitialMessagesScrollRef.current) {
      isInitialMessagesScrollRef.current = false;
    }

    if (!shouldStickToBottomRef.current && behavior === "smooth") return;

    requestAnimationFrame(() => {
      scrollMessagesToBottom(container, behavior);
      if (behavior === "auto") {
        shouldStickToBottomRef.current = true;
      }
    });
  }, [messages, messagesLoading]);

  useEffect(() => {
    if (document.hidden) return;
    conversationsPollRef.current = setInterval(() => {
      if (!document.hidden) fetchConversations(true);
    }, CONVERSATIONS_POLL_MS);
    return () => {
      if (conversationsPollRef.current) clearInterval(conversationsPollRef.current);
    };
  }, [fetchConversations]);

  useEffect(() => {
    if (!selectedId) return;
    messagesPollRef.current = setInterval(() => {
      if (!document.hidden) fetchMessages(selectedId, false);
    }, MESSAGES_POLL_MS);
    return () => {
      if (messagesPollRef.current) clearInterval(messagesPollRef.current);
    };
  }, [selectedId, fetchMessages]);

  const getDisplayName = (c: Conversation) => {
    if (isAiAgentConversation(c)) return AI_SCAM_DETECT_AGENT_DISPLAY_NAME;
    return (
      c.name ||
      contactsMap[normalizePhone(c.phone ?? "")] ||
      contactsMap[normalizePhone(c.id ?? "")] ||
      c.phone ||
      c.id ||
      "—"
    );
  };

  const getConversationSubtitle = (c: Conversation) => {
    if (c.isGroup) return "Group chat";
    return getSenderPhone(c);
  };

  const getSenderPhone = (c: Conversation) => {
    const raw = (c.phone ?? "").replace(/^'+/, "").trim();
    if (raw && /\+?\d[\d\s-]{6,}/.test(raw)) return raw;
    return raw || c.id || "—";
  };

  const openScamReport = useCallback(async (message: Message) => {
    if (!selectedId || !activeSessionId) return;
    setScamReportModal({ report: "", loading: true, error: null });
    try {
      const res = await fetch(
        withSessionId(
          `/api/whatsapp/conversations/${encodeURIComponent(selectedId)}/messages/${encodeURIComponent(message.id)}/scam-report`,
          activeSessionId
        ),
        { cache: "no-store" }
      );
      const data = (await res.json().catch(() => ({}))) as { report?: string; error?: string };
      if (!res.ok) {
        setScamReportModal({
          report: "",
          loading: false,
          error: data.error ?? "Failed to load scam report",
        });
        return;
      }
      setScamReportModal({
        report: data.report ?? "",
        loading: false,
        error: data.report ? null : "No scam report found for this message.",
      });
    } catch {
      setScamReportModal({
        report: "",
        loading: false,
        error: "Failed to load scam report",
      });
    }
  }, [selectedId, activeSessionId]);

  const filteredConversations = useMemo(() => {
    const list = search.trim()
      ? conversations.filter((c) => {
          const q = search.trim().toLowerCase();
          const display = getDisplayName(c).toLowerCase();
          return (
            display.includes(q) ||
            (c.lastMessage ?? "").toLowerCase().includes(q) ||
            (c.id ?? "").toLowerCase().includes(q) ||
            (c.phone ?? "").toLowerCase().includes(q)
          );
        })
      : conversations;
    return [...list].sort((a, b) => {
      const ta = a.updatedAt ?? "";
      const tb = b.updatedAt ?? "";
      const na = Number(ta);
      const nb = Number(tb);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return nb - na;
      return (tb as string).localeCompare(ta as string);
    });
  }, [conversations, search, contactsMap]);

  const selectedConversation = selectedId
    ? conversations.find((c) => c.id === selectedId)
    : null;

  const messagesByDate = useMemo(() => {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = "";
    for (const m of messages) {
      const ts = m.createdAt ?? "";
      const n = Number(ts);
      const dateKey = !Number.isNaN(n) && n > 0
        ? new Date(n > 1e12 ? n : n * 1000).toDateString()
        : ts;
      if (dateKey !== currentDate) {
        currentDate = dateKey;
        groups.push({ date: ts, messages: [m] });
      } else {
        groups[groups.length - 1].messages.push(m);
      }
    }
    return groups;
  }, [messages]);

  return (
    <div className="relative flex h-[calc(100vh-5.5rem)] min-h-[32rem] flex-col rounded-2xl bg-gradient-to-br from-emerald-50/50 via-white to-teal-50/40 p-0.5">
      {scamReportModal && (
        <ScamReportModal
          report={scamReportModal.report}
          loading={scamReportModal.loading}
          error={scamReportModal.error}
          onClose={() => setScamReportModal(null)}
        />
      )}
      {/* Completion toast: shown when we transition from backfilling to done. Success only when backfillJustRan (avoids toast on normal loads); error when request failed. */}
      {backfillCompleteToast && (
        <div
          role="alert"
          className={`mb-3 flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm ${
            backfillCompleteToast === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          <span>
            {backfillCompleteToast === "error"
              ? "Backfill finished with errors"
              : "Sync complete"}
            {backfillCompleteToast === "error" && conversationsError && (
              <span className="ml-1">— {conversationsError}</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setBackfillCompleteToast(null)}
            className="shrink-0 rounded p-1 opacity-70 hover:opacity-100"
            aria-label="Dismiss"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Full-page overlay until DB is caught up to today or user clicks Stop. */}
      {showOverlay && (
        <BackfillOverlay
          syncStatus={syncStatus}
          onStop={async () => {
            try {
              await fetch("/api/whatsapp/sync/abort", { method: "POST", cache: "no-store" });
              setOverlayDismissedByUser(true);
            } catch {
              setOverlayDismissedByUser(true);
            }
          }}
        />
      )}
      {/* Optional non-blocking badge when overlay is hidden but backfill still running. */}
      {!showOverlay && syncStatus?.isBackfilling && (
        <div
          className="mb-3 flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-800"
          role="status"
        >
          Syncing history…
        </div>
      )}

      <DashboardPageBanner
        compact
        tone="emerald"
        className="mb-3 shrink-0"
        title="WhatsApp Inbox"
        subtitle={
          activeSession
            ? `Viewing messages for ${getInboxSessionLabel(activeSession)}.`
            : "View WhatsApp messages from your connected account."
        }
        meta={
          syncStatus
            ? `Latest DB message: ${formatSyncStatusTime(syncStatus.latestDbMessageTs)}`
            : undefined
        }
      />

      {connectedSessions.length > 1 ? (
        <div
          className="mb-3 flex shrink-0 justify-center px-2"
          role="tablist"
          aria-label="WhatsApp sessions"
        >
          <div className="flex flex-wrap justify-center gap-2">
            {connectedSessions.map((session) => {
              const isActive = session.sessionId === activeSessionId;
              return (
                <button
                  key={session.sessionId}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => handleSessionChange(session.sessionId)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
                    isActive
                      ? "bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-600/20"
                      : "border border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50"
                  }`}
                >
                  <WhatsAppIcon
                    className={`h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4 ${
                      isActive ? "text-white" : "text-[#25D366]"
                    }`}
                  />
                  {getInboxSessionLabel(session)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div
        className={`flex min-h-0 flex-1 gap-0 overflow-hidden rounded-xl border-2 border-emerald-200/70 ${INBOX_SHELL_CLASS}`}
      >
        {/* Left: conversation list */}
        <aside className="flex w-80 shrink-0 flex-col border-r border-emerald-200/60 bg-white/10 lg:w-96 xl:w-[26rem]">
          <div className="border-b border-emerald-500/20 bg-gradient-to-r from-emerald-600 to-teal-600 p-3">
            <input
              type="search"
              placeholder="Search conversations"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={!activeSessionId}
              className="w-full rounded-lg border-0 bg-white/95 px-3 py-2 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-white/60 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => void fetchConversations()}
                disabled={conversationsLoading || !activeSessionId}
                className="rounded-lg border border-white/30 p-1.5 text-white/90 transition hover:bg-white/15 disabled:opacity-50"
                aria-label="Refresh"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>
          <div className={`flex-1 overflow-y-auto ${INBOX_SIDEBAR_LIST_CLASS}`}>
            {!sessionsLoading && connectedSessions.length === 0 && (
              <p className="mx-2 mt-2 rounded-lg bg-white/50 p-3 text-sm text-[#54656f] shadow-sm backdrop-blur-sm">
                No connected WhatsApp sessions. Connect an account on WhatsApp Connect first.
              </p>
            )}
            {conversationsError && (
              <p className="mx-2 mt-2 rounded-lg bg-white/50 p-3 text-sm text-red-600 shadow-sm backdrop-blur-sm">
                {conversationsError}
              </p>
            )}
            {!conversationsError && conversationsLoading && conversations.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-4 py-12">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#00a884] border-t-transparent" aria-hidden />
                <p className="rounded-lg bg-white/45 px-3 py-1 text-sm text-[#54656f] shadow-sm backdrop-blur-sm">
                  Loading conversations…
                </p>
              </div>
            )}
            {!conversationsError && !conversationsLoading && filteredConversations.length === 0 && activeSessionId && (
              <p className="mx-2 mt-2 rounded-lg bg-white/50 p-3 text-sm text-[#54656f] shadow-sm backdrop-blur-sm">
                No conversations.
              </p>
            )}
            {filteredConversations.map((c) => {
              const unread = (c.unreadCount ?? 0) > 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  disabled={conversationsLoading}
                  className={`flex w-full items-start gap-3 border-b border-[#e9edef] px-3 py-3 text-left transition-colors disabled:cursor-wait disabled:opacity-60 ${
                    selectedId === c.id
                      ? "border-l-4 border-l-[#00a884] bg-white/35 pl-2 backdrop-blur-sm"
                      : "border-l-4 border-l-transparent bg-white/15 hover:bg-white/30 backdrop-blur-sm"
                  }`}
                >
                  <ConversationAvatar conversation={c} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">
                      {getDisplayName(c)}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {c.isGroup ? "Group chat" : getSenderPhone(c)}
                    </p>
                    {c.lastMessage && (
                      <p className="mt-0.5 truncate text-sm text-slate-600">{c.lastMessage}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="text-xs text-slate-500">{formatListTime(c.updatedAt)}</span>
                    {unread && (
                      <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-medium text-white shadow-sm">
                        {c.unreadCount! > 99 ? "99+" : c.unreadCount}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Center: chat */}
        <div className="flex min-w-0 flex-1 flex-col bg-gradient-to-br from-teal-50/30 to-white">
          {conversationsLoading && conversations.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-gradient-to-br from-emerald-50/50 to-teal-50/40 px-6 text-emerald-900">
              <div className="w-full max-w-xs space-y-3">
                <p className="text-center text-sm font-medium text-slate-700">
                  Syncing messages to database
                </p>
                <p className="text-center text-xs text-slate-500">
                  Loading your previous WhatsApp messages into the database. This may take a few minutes on first use.
                </p>
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
                  role="progressbar"
                  aria-valuenow={undefined}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Backfill in progress"
                >
                  <div
                    className="h-full w-full rounded-full bg-emerald-500 animate-backfill-progress"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent 0%, rgb(16 185 129) 40%, rgb(16 185 129) 60%, transparent 100%)",
                      backgroundSize: "200% 100%",
                    }}
                  />
                </div>
                <p className="text-center text-xs text-slate-400">
                  Don&apos;t close this page until syncing finishes.
                </p>
              </div>
            </div>
          ) : !selectedId ? (
            <div
              className={`flex flex-1 flex-col items-center justify-center gap-2 ${WHATSAPP_WALLPAPER_CLASS}`}
              style={whatsAppWallpaperStyle}
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-[#00a884] shadow-md ring-4 ring-white/80">
                <WhatsAppIcon className="h-7 w-7" />
              </span>
              <p className="rounded-lg bg-white/90 px-4 py-2 font-medium text-[#111b21] shadow-sm">
                Select a conversation
              </p>
              <p className="text-sm text-[#667781]">Choose a chat from the list to view messages</p>
            </div>
          ) : (
            <>
              <div
                className="flex shrink-0 items-center gap-3 border-b border-white/15 px-4 py-3 text-white shadow-md"
                style={{ backgroundImage: headerBarStyle }}
              >
                <ConversationAvatar
                  tone="onColor"
                  conversation={
                    selectedConversation ?? (selectedId ? { id: selectedId } : null)
                  }
                />
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">
                    {selectedConversation
                      ? getDisplayName(selectedConversation)
                      : isAiScamDetectAgentContact(selectedId)
                        ? AI_SCAM_DETECT_AGENT_DISPLAY_NAME
                        : selectedId ?? "—"}
                  </p>
                  {selectedConversation && (
                    <p className="truncate text-xs text-emerald-100/90">
                      {getConversationSubtitle(selectedConversation)}
                    </p>
                  )}
                </div>
              </div>

              <div
                ref={messagesContainerRef}
                onScroll={handleMessagesScroll}
                className={`flex-1 overflow-y-auto px-4 py-3 ${WHATSAPP_WALLPAPER_CLASS}`}
                style={whatsAppWallpaperStyle}
              >
                {messagesLoading && messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center gap-3 py-12">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#00a884] border-t-transparent" aria-hidden />
                    <p className="text-sm text-[#54656f]">Loading messages…</p>
                  </div>
                )}
                {messagesError && (
                  <p className="text-sm text-red-600">{messagesError}</p>
                )}
                {!messagesLoading && !messagesError && messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                    <p className="rounded-lg bg-white/90 px-4 py-2 text-sm text-[#54656f] shadow-sm">
                      No messages in this conversation yet.
                    </p>
                  </div>
                )}
                <div className="space-y-3">
                  {messagesByDate.map(({ date, messages: msgs }) => (
                    <div key={date}>
                      <div className="mb-3 flex justify-center">
                        <span className="rounded-lg bg-emerald-800/10 px-3 py-1 text-[11px] font-medium text-emerald-900 shadow-sm ring-1 ring-emerald-200/60">
                          {formatDateDivider(msgs[0]?.createdAt ?? date)}
                        </span>
                      </div>
                      <div className="w-full space-y-1">
                        {msgs.map((m) => {
                          const isSentByUs = m.fromMe === true;
                          const scamPct = m.scamPercentage ?? 0;
                          const hasScamRisk = scamPct > 0;
                          const isHighScamRisk = scamPct > 75;
                          return (
                          <div
                            key={m.id}
                            className={`flex w-full items-center gap-1.5 ${isSentByUs ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`relative max-w-[min(85%,40rem)] px-3 py-2 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] ${
                                isSentByUs
                                  ? "order-2 rounded-lg rounded-tr-none bg-[#d9fdd3] text-[#111b21]"
                                  : "order-1 rounded-lg rounded-tl-none bg-white text-[#111b21]"
                              }`}
                            >
                              <div className="min-w-0">
                                {!isSentByUs && m.senderName ? (
                                  <p className="mb-0.5 text-[12.8px] font-semibold leading-snug text-[#e5425d]">
                                    {m.senderName}
                                  </p>
                                ) : null}
                                {m.imageUrl ? (
                                  <div className="mb-2 flex justify-center">
                                    <img
                                      src={getInboxMediaSrc(m.imageUrl)}
                                      alt="WhatsApp image"
                                      className="max-h-72 max-w-full rounded-md object-contain"
                                      loading="lazy"
                                    />
                                  </div>
                                ) : null}
                                {m.voiceUrl ? (
                                  <div
                                    className="inbox-voice-player-wrap mb-2 w-full rounded-lg p-1.5 shadow-sm"
                                    style={{ backgroundImage: headerBarStyle }}
                                  >
                                    <audio
                                      controls
                                      preload="metadata"
                                      className="inbox-voice-player block w-full"
                                    >
                                      <source src={getInboxMediaSrc(m.voiceUrl)} />
                                    </audio>
                                  </div>
                                ) : null}
                                {shouldShowMessageText(m) ? (
                                  <p className="whitespace-pre-wrap break-words text-[18.5px] leading-[25px]">
                                    {m.text}
                                  </p>
                                ) : !m.imageUrl && !m.voiceUrl ? (
                                  <p className="text-[18.5px] italic text-[#667781]">(message)</p>
                                ) : null}
                                {hasScamRisk && (
                                  <div
                                    className={`mt-2 text-[14px] leading-snug ${getScamRiskColorClass(scamPct)}`}
                                  >
                                    <p className="font-semibold">Scam risk: {scamPct}%</p>
                                    {m.scamDescription && (
                                      <p className="mt-1 font-normal opacity-90">{m.scamDescription}</p>
                                    )}
                                  </div>
                                )}
                                <p className="mt-1 text-right text-[11px] leading-none text-[#667781]">
                                  {formatMessageTimeShort(m.createdAt)}
                                </p>
                              </div>
                            </div>
                            {isHighScamRisk ? (
                              <button
                                type="button"
                                onClick={() => openScamReport(m)}
                                className={`shrink-0 rounded-full p-0.5 text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 ${
                                  isSentByUs ? "order-1" : "order-2"
                                }`}
                                aria-label="View scam report"
                                title="View scam report"
                              >
                                <HighScamRiskIcon className="h-7 w-7" />
                              </button>
                            ) : null}
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div ref={messagesEndRef} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
