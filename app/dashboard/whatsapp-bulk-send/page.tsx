"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface ClientRecord {
  Name?: string;
  Whatsapp_number?: string;
  [key: string]: unknown;
}

/** Preferred column order for customer list; unknown keys follow alphabetically. */
const PREFERRED_COLUMN_ORDER = [
  "Id",
  "Name",
  "Whatsapp_number",
  "Gender",
  "DOB",
  "Tags",
  "Purchase_Date",
  "Purchase_Amount",
] as const;

/** Column keys to hide from the customer list (Client ID, CreatedAt, UpdatedAt). */
const HIDDEN_COLUMN_KEYS = new Set([
  "Client ID",
  "Client_ID",
  "CreatedAt",
  "Created_At",
  "created_at",
  "UpdatedAt",
  "Updated_At",
  "updated_at",
]);

function isHiddenColumn(key: string): boolean {
  const normalized = key.trim().replace(/\s+/g, " ");
  return (
    HIDDEN_COLUMN_KEYS.has(key) ||
    HIDDEN_COLUMN_KEYS.has(normalized) ||
    /^Client\s*ID$/i.test(key) ||
    /^Created\s*At$/i.test(key) ||
    /^Updated\s*At$/i.test(key)
  );
}

/** Human-readable label for a column key. */
function columnLabel(key: string): string {
  const labels: Record<string, string> = {
    Id: "ID",
    Name: "Name",
    Whatsapp_number: "WhatsApp",
    "Whatsapp number": "WhatsApp",
    Gender: "Gender",
    DOB: "DOB",
    Tags: "Tags",
    Purchase_Date: "Purchase date",
    "Purchase Date": "Purchase date",
    Purchase_Amount: "Purchase amount",
    "Purchase Amount": "Purchase amount",
  };
  return labels[key] ?? key.replace(/_/g, " ");
}

function formatCellValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "object" && !Array.isArray(value)) return JSON.stringify(value);
  return String(value);
}

interface TemplateOption {
  id: unknown;
  templateName: string;
  messageBody: string;
  language: string;
  image1?: string;
  image2?: string;
  image3?: string;
  image4?: string;
}

function getValue(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && v !== "") return String(v);
  }
  return "";
}

function getPhotoSrc(url: string): string {
  if (!url) return "";
  if (/^IMG_/.test(url.trim())) return `/api/photos/${encodeURIComponent(url.trim())}`;
  if (/X-Amz-Signature=/i.test(url)) return url;
  if (
    url.includes("nocodb") ||
    url.includes("amazonaws.com") ||
    (url.includes("s3.") && url.includes("nocohub"))
  ) {
    return `/api/photos/proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

export default function WhatsAppBulkSendPage() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    ok?: boolean;
    error?: string;
    sent?: number;
    failed?: number;
    total?: number;
  }>({});

  const fetchClients = useCallback(() => {
    setClientsLoading(true);
    fetch("/api/clients", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { clients?: ClientRecord[] }) => setClients(d.clients ?? []))
      .catch(() => setClients([]))
      .finally(() => setClientsLoading(false));
  }, []);

  const fetchTemplates = useCallback(() => {
    setTemplatesLoading(true);
    fetch("/api/whatsapp-templates", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { templates?: TemplateOption[] }) => setTemplates(d.templates ?? []))
      .catch(() => setTemplates([]))
      .finally(() => setTemplatesLoading(false));
  }, []);

  useEffect(() => {
    fetchClients();
    fetchTemplates();
  }, [fetchClients, fetchTemplates]);

  const filteredClients = search.trim()
    ? clients.filter((row) => {
        const r = row as Record<string, unknown>;
        const name = getValue(r, "Name", "name").toLowerCase();
        const whatsapp = getValue(r, "Whatsapp_number", "Whatsapp number", "whatsapp_number").toLowerCase();
        const q = search.trim().toLowerCase();
        return name.includes(q) || whatsapp.includes(q);
      })
    : clients;

  /** All column keys from client data, excluding hidden columns (Client ID, CreatedAt, UpdatedAt). */
  const allColumnKeys = useMemo(() => {
    const set = new Set<string>();
    clients.forEach((row) =>
      Object.keys(row as Record<string, unknown>)
        .filter((k) => !isHiddenColumn(k))
        .forEach((k) => set.add(k))
    );
    const preferred = PREFERRED_COLUMN_ORDER.filter((k) => set.has(k));
    const rest = [...set].filter((k) => !PREFERRED_COLUMN_ORDER.includes(k as (typeof PREFERRED_COLUMN_ORDER)[number])).sort();
    return [...preferred, ...rest];
  }, [clients]);

  function toggleClient(row: ClientRecord) {
    const r = row as Record<string, unknown>;
    const id = String(r.Id ?? r.id ?? getValue(r, "Whatsapp_number"));
    if (!id) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === filteredClients.length) {
      setSelectedIds(new Set());
    } else {
      const ids = new Set<string>();
      filteredClients.forEach((row) => {
        const r = row as Record<string, unknown>;
        const id = String(r.Id ?? r.id ?? getValue(r, "Whatsapp_number"));
        if (id) ids.add(id);
      });
      setSelectedIds(ids);
    }
  }

  async function handleSend() {
    const selected = clients.filter((row) => {
      const r = row as Record<string, unknown>;
      const id = String(r.Id ?? r.id ?? getValue(r, "Whatsapp_number"));
      return id && selectedIds.has(id);
    });
    if (selected.length === 0) {
      alert("Please select at least one customer.");
      return;
    }
    const template = templates.find((t) => String(t.id) === selectedTemplateId);
    if (!template && templates.length > 0) {
      alert("Please select a template.");
      return;
    }

    const recipients = selected.map((row) => {
      const r = row as Record<string, unknown>;
      const phone = getValue(r, "Whatsapp_number", "Whatsapp number", "whatsapp_number");
      const name = getValue(r, "Name", "name");
      return { phone, name: name || undefined };
    }).filter((r) => r.phone);

    if (recipients.length === 0) {
      alert("Selected customers have no WhatsApp numbers.");
      return;
    }

    setIsSending(true);
    setSendResult({});
    try {
      const res = await fetch("/api/whatsapp-bulk-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients,
          templateId: template?.id,
          templateName: template?.templateName,
          messageBody: template?.messageBody,
          image1: template?.image1,
          image2: template?.image2,
          image3: template?.image3,
          image4: template?.image4,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendResult({ error: (data as { error?: string }).error ?? "Send failed" });
        return;
      }
      const d = data as { sent?: number; failed?: number; total?: number };
      setSendResult({
        ok: true,
        sent: d.sent,
        failed: d.failed,
        total: d.total,
      });
      setSelectedIds(new Set());
    } catch (e) {
      setSendResult({ error: "Failed to send. Please try again." });
      console.error(e);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">WhatsApp Bulk Send</h1>
        <p className="mt-1 text-sm text-slate-600">
          Select customers and a template to send WhatsApp messages via the connected WhatsApp.
        </p>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Template</h2>
        <div className="mt-3">
          <select
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Select template</option>
            {templatesLoading ? (
              <option disabled>Loading...</option>
            ) : (
              templates.map((t) => (
                <option key={String(t.id)} value={String(t.id)}>
                  {t.templateName || "Untitled"} {t.language ? `(${t.language})` : ""}
                </option>
              ))
            )}
          </select>
        </div>

        {selectedTemplateId && (() => {
          const t = templates.find((x) => String(x.id) === selectedTemplateId);
          if (!t) return null;
          const images = [t.image1, t.image2, t.image3, t.image4].filter(Boolean) as string[];
          return (
            <div className="mt-4 rounded-xl bg-[#e5ddd5] p-4">
              <p className="mb-2 text-center text-xs font-medium text-slate-600">Preview</p>
              <div className="flex justify-center">
                <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-[#D9FDD3] px-4 py-3 shadow-md">
                  <div className="space-y-2">
                    {images.length > 0 && (
                      <div className="grid gap-1" style={{ gridTemplateColumns: images.length <= 2 ? `repeat(${images.length}, 1fr)` : "repeat(2, 1fr)" }}>
                        {images.map((src, i) => (
                          <div key={i} className="overflow-hidden rounded-lg">
                            <img
                              src={getPhotoSrc(src)}
                              alt=""
                              className="max-h-32 w-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    {t.messageBody && (
                      <p className="whitespace-pre-wrap break-words text-sm text-slate-900">
                        {t.messageBody}
                      </p>
                    )}
                    {!t.messageBody && images.length === 0 && (
                      <p className="text-sm italic text-slate-500">No content</p>
                    )}
                  </div>
                  <p className="mt-2 text-right text-[10px] text-slate-500">now</p>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-900">Customer list</h2>
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or WhatsApp..."
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={fetchClients}
              disabled={clientsLoading}
              className="rounded border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={isSending || selectedIds.size === 0}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSending ? "Sending…" : `Send to ${selectedIds.size} selected`}
            </button>
          </div>
        </div>

        {sendResult.ok && (
          <div className="mt-3 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
            <p className="font-medium">Messages sent successfully.</p>
            {(sendResult.sent != null || sendResult.failed != null || sendResult.total != null) && (
              <p className="mt-1 text-emerald-700">
                Sent: {sendResult.sent ?? "—"} · Failed: {sendResult.failed ?? "—"} · Total: {sendResult.total ?? "—"}
              </p>
            )}
          </div>
        )}
        {sendResult.error && (
          <p className="mt-3 text-sm text-red-600">{sendResult.error}</p>
        )}

        {clientsLoading ? (
          <p className="mt-4 text-sm text-slate-500">Loading customers…</p>
        ) : filteredClients.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No customers found. Add customers first.</p>
        ) : (
          <div className="mt-4 max-h-[400px] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="sticky left-0 z-10 min-w-[2.5rem] bg-slate-50 px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={
                        filteredClients.length > 0 &&
                        filteredClients.every((row) => {
                          const r = row as Record<string, unknown>;
                          const id = String(r.Id ?? r.id ?? getValue(r, "Whatsapp_number"));
                          return id && selectedIds.has(id);
                        })
                      }
                      onChange={toggleAll}
                      className="rounded border-slate-300"
                    />
                  </th>
                  {allColumnKeys.map((key) => (
                    <th
                      key={key}
                      className="min-w-[6rem] px-3 py-2 text-left font-medium text-slate-700"
                    >
                      {columnLabel(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((row, i) => {
                  const r = row as Record<string, unknown>;
                  const id = String(r.Id ?? r.id ?? getValue(r, "Whatsapp_number") || i);
                  const isSelected = selectedIds.has(id);
                  return (
                    <tr
                      key={id}
                      className="border-b border-slate-100 hover:bg-slate-50"
                    >
                      <td className="sticky left-0 z-10 min-w-[2.5rem] bg-white px-3 py-2 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleClient(row)}
                          className="rounded border-slate-300"
                        />
                      </td>
                      {allColumnKeys.map((key) => (
                        <td
                          key={key}
                          className="max-w-[12rem] truncate px-3 py-2 text-slate-700"
                          title={formatCellValue(r[key])}
                        >
                          {formatCellValue(r[key])}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-2 text-xs text-slate-500">
          Selected: {selectedIds.size}. Messages will be sent via the connected WhatsApp webhook.
        </p>
      </div>
    </div>
  );
}
