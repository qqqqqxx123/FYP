"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClientRecord } from "@/lib/nocodb";
import { createClientsAction, type CreateClientsState } from "./actions";

const WHATSAPP_PREFIXES = ["+852", "+60"] as const;

const clientFields: Array<{ key: keyof ClientRecord; label: string }> = [
  { key: "Name", label: "Name" },
  { key: "Whatsapp_number", label: "WhatsApp number" },
  { key: "Gender", label: "Gender" },
  { key: "DOB", label: "DOB" },
  { key: "Tags", label: "Tags" },
  { key: "Purchase_Date", label: "Purchase date" },
  { key: "Purchase_Amount", label: "Purchase amount" },
];

function parseWhatsAppNumber(value: string): { prefix: string; local: string } {
  const v = (value ?? "").trim();
  if (v.startsWith("+852")) return { prefix: "+852", local: v.slice(4).trim() };
  if (v.startsWith("+60")) return { prefix: "+60", local: v.slice(3).trim() };
  return { prefix: WHATSAPP_PREFIXES[0], local: v };
}

const MONTHS = [
  { value: "", label: "Month" },
  { value: "01", label: "01" },
  { value: "02", label: "02" },
  { value: "03", label: "03" },
  { value: "04", label: "04" },
  { value: "05", label: "05" },
  { value: "06", label: "06" },
  { value: "07", label: "07" },
  { value: "08", label: "08" },
  { value: "09", label: "09" },
  { value: "10", label: "10" },
  { value: "11", label: "11" },
  { value: "12", label: "12" },
];

function parseDate(value: string): { year: string; month: string; day: string } {
  const v = (value ?? "").trim();
  const full = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (full) return { year: full[1], month: full[2], day: full[3] };
  const yearMonth = v.match(/^(\d{4})-(\d{2})$/);
  if (yearMonth) return { year: yearMonth[1], month: yearMonth[2], day: "" };
  const yearOnly = v.match(/^(\d{4})$/);
  if (yearOnly) return { year: yearOnly[1], month: "", day: "" };
  return { year: "", month: "", day: "" };
}

function toYYYYMMDD(year: string, month: string, day: string): string {
  if (!year) return "";
  if (!month) return year;
  if (!day) return `${year}-${month}`;
  return `${year}-${month}-${day}`;
}

/** Compute age in years from DOB (YYYY-MM-DD or YYYY-MM). Returns "" if DOB invalid or missing. */
function getAgeFromDob(dob: string): string {
  const v = (dob ?? "").trim();
  if (!v) return "";
  const match = v.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2})?)?)?/);
  if (!match) return "";
  const birthYear = parseInt(match[1], 10);
  const birthMonth = match[2] ? parseInt(match[2], 10) - 1 : 0;
  const birthDay = match[3] ? parseInt(match[3], 10) : 1;
  const today = new Date();
  let age = today.getFullYear() - birthYear;
  if (birthMonth > today.getMonth() || (birthMonth === today.getMonth() && birthDay > today.getDate())) {
    age -= 1;
  }
  return age >= 0 && age <= 120 ? String(age) : "";
}

function getYearOptions(forDob: boolean): Array<{ value: string; label: string }> {
  const currentYear = new Date().getFullYear();
  const start = forDob ? currentYear - 120 : 2020;
  const end = forDob ? currentYear : currentYear + 1;
  const options: Array<{ value: string; label: string }> = [{ value: "", label: "Year" }];
  for (let y = end; y >= start; y -= 1)
    options.push({ value: String(y), label: String(y) });
  return options;
}

function getDayOptions(): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [{ value: "", label: "Day" }];
  for (let d = 1; d <= 31; d += 1) {
    const value = d < 10 ? `0${d}` : String(d);
    options.push({ value, label: value });
  }
  return options;
}

/** Format a numeric value as money (2 decimals, thousands sep). Returns "—" for empty/invalid. */
function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const s = String(value).trim();
  if (!s) return "—";
  const n = Number(s.replace(/[^\d.-]/g, ""));
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-HK", {
    style: "currency",
    currency: "HKD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

const headerMap: Record<string, keyof ClientRecord> = {
  client_id: "Client ID",
  clientid: "Client ID",
  "client id": "Client ID",
  name: "Name",
  whatsapp_number: "Whatsapp_number",
  "whatsapp number": "Whatsapp_number",
  whatsappnumber: "Whatsapp_number",
  gender: "Gender",
  dob: "DOB",
  tags: "Tags",
  purchase_date: "Purchase_Date",
  "purchase date": "Purchase_Date",
  purchasedate: "Purchase_Date",
  purchase_amount: "Purchase_Amount",
  "purchase amount": "Purchase_Amount",
  purchaseamount: "Purchase_Amount",
};

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function mapHeader(header: string): keyof ClientRecord | null {
  const normalized = normalizeHeader(header);
  return headerMap[normalized] ?? null;
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let isInQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (isInQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        isInQuotes = !isInQuotes;
      }
      continue;
    }

    if (char === "," && !isInQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function parseCsv(text: string): ClientRecord[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const mappedHeaders = headers.map((header) => mapHeader(header));

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const record: ClientRecord = {};

    mappedHeaders.forEach((mappedHeader, index) => {
      if (!mappedHeader) return;
      const value = values[index];
      if (!value) return;
      if (mappedHeader === "Purchase_Amount") {
        const numeric = Number(value);
        record[mappedHeader] = Number.isNaN(numeric) ? value : numeric;
        return;
      }
      record[mappedHeader] = value;
    });

    return record;
  });
}

/** Normalize WhatsApp number for NocoDB: 8 digits → +852 (HK), otherwise → +60. Strips existing +852/+60. */
function normalizeWhatsAppForNocoDB(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "").trim();
  if (!digits) return "";
  if (digits.length === 8) return `+852${digits}`;
  if (digits.startsWith("852") && digits.length >= 11) return `+852${digits.slice(3, 11)}`;
  if (digits.startsWith("60") && digits.length > 2) return `+60${digits.slice(2)}`;
  return `+60${digits}`;
}

/** Normalize Gender for storage: Female → F, Male → M; keep F/M as-is. */
function normalizeGenderForNocoDB(raw: string): string {
  const v = (raw ?? "").trim();
  if (/^female$/i.test(v)) return "F";
  if (/^male$/i.test(v)) return "M";
  if (v === "F" || v === "M") return v;
  return v || "";
}

/** Parse D/M/YYYY, M/D/YYYY, or YYYY-MM-DD and return YYYY-MM-DD for NocoDB. */
function normalizeDateForNocoDB(raw: string): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return v;
  const dmy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const day = d!.padStart(2, "0");
    const month = m!.padStart(2, "0");
    return `${y}-${month}-${day}`;
  }
  return v;
}

function getCsvTemplate() {
  return (
    "Name,Whatsapp_number,Gender,DOB,Tags,Purchase_Date,Purchase_Amount\n" +
    "Jane Doe,91231234,F,1992-05-10,VIP|Summer,2025-01-10,1200"
  );
}

export function CustomerManager() {
  const [manual, setManual] = useState<ClientRecord>({});
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualStatus, setManualStatus] = useState<CreateClientsState>({});
  const [isManualSaving, setIsManualSaving] = useState(false);

  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvRecords, setCsvRecords] = useState<ClientRecord[]>([]);
  const [csvStatus, setCsvStatus] = useState<CreateClientsState>({});
  const [isCsvUploading, setIsCsvUploading] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<"copied" | "error" | null>(null);

  const csvCount = useMemo(() => csvRecords.length, [csvRecords.length]);

  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);
  const [editForm, setEditForm] = useState<ClientRecord>({});
  const [isEditingSaving, setIsEditingSaving] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | number | null>(null);

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((row) => {
      const r = row as Record<string, unknown>;
      const name = String(r.Name ?? r.name ?? "").toLowerCase();
      const whatsapp = String(r.Whatsapp_number ?? r.whatsapp_number ?? r["Whatsapp number"] ?? "").toLowerCase();
      return name.includes(q) || whatsapp.includes(q);
    });
  }, [clients, clientSearch]);

  const fetchClients = useCallback(() => {
    setClientsLoading(true);
    fetch("/api/clients", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { clients?: ClientRecord[] }) => setClients(data.clients ?? []))
      .catch(() => setClients([]))
      .finally(() => setClientsLoading(false));
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  async function handleCopyCsvTemplate() {
    const text = getCsvTemplate();
    setCopyFeedback(null);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopyFeedback("copied");
      } else {
        fallbackCopyToClipboard(text);
        setCopyFeedback("copied");
      }
    } catch {
      try {
        fallbackCopyToClipboard(text);
        setCopyFeedback("copied");
      } catch {
        setCopyFeedback("error");
      }
    }
    setTimeout(() => setCopyFeedback(null), 2500);
  }

  function fallbackCopyToClipboard(text: string) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (!ok) throw new Error("Copy failed");
  }

  async function handleManualSubmit() {
    const name = String(manual.Name ?? "").trim();
    const whatsapp = String(manual.Whatsapp_number ?? "").trim();
    const gender = String(manual.Gender ?? "").trim();

    if (!name) {
      setManualStatus({ error: "Name is required" });
      return;
    }
    if (!whatsapp) {
      setManualStatus({ error: "WhatsApp number is required" });
      return;
    }
    if (!gender) {
      setManualStatus({ error: "Gender is required" });
      return;
    }

    setIsManualSaving(true);
    setManualStatus({});
    try {
      const normalized = {
        ...manual,
        Whatsapp_number: normalizeWhatsAppForNocoDB(whatsapp),
        Gender: normalizeGenderForNocoDB(gender),
      };
      const formData = new FormData();
      formData.set("payload", JSON.stringify([normalized]));
      const result = await createClientsAction(formData);
      setManualStatus(result);
      if (result.inserted) {
        setManual({});
        fetchClients();
      }
    } finally {
      setIsManualSaving(false);
    }
  }

  async function handleCsvUpload() {
    setIsCsvUploading(true);
    setCsvStatus({});
    try {
      const normalized = csvRecords.map((r) => {
        const raw = r as Record<string, unknown>;
        const whatsapp = String(raw.Whatsapp_number ?? raw["Whatsapp number"] ?? "").trim();
        const gender = String(raw.Gender ?? "").trim();
        const dob = String(raw.DOB ?? "").trim();
        const purchaseDate = String(raw.Purchase_Date ?? raw["Purchase Date"] ?? "").trim();
        return {
          ...r,
          Whatsapp_number: normalizeWhatsAppForNocoDB(whatsapp),
          Gender: normalizeGenderForNocoDB(gender) || gender,
          DOB: normalizeDateForNocoDB(dob) || dob,
          Purchase_Date: normalizeDateForNocoDB(purchaseDate) || purchaseDate,
        };
      });
      const formData = new FormData();
      formData.set("payload", JSON.stringify(normalized));
      const result = await createClientsAction(formData);
      setCsvStatus(result);
      if (result.inserted) fetchClients();
    } finally {
      setIsCsvUploading(false);
    }
  }

  function handleCsvChange(file: File | null) {
    if (!file) {
      setCsvFileName(null);
      setCsvRecords([]);
      return;
    }
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setCsvRecords(parseCsv(text));
    };
    reader.readAsText(file);
  }

  function updateManualField(key: keyof ClientRecord, value: string) {
    setManual((prev) => ({ ...prev, [key]: value }));
  }

  function getRecordId(row: ClientRecord): string | number | null {
    const r = row as Record<string, unknown>;
    if (r.Id != null) return r.Id as string | number;
    if (r.id != null) return r.id as string | number;
    return null;
  }

  function openEditModal(row: ClientRecord) {
    setEditingClient(row);
    setEditForm({
      Name: getClientValue(row, "Name"),
      Whatsapp_number: getClientValue(row, "Whatsapp_number"),
      Gender: getClientValue(row, "Gender"),
      DOB: getCell(row, "DOB", "dob"),
      Tags: getClientValue(row, "Tags"),
      Purchase_Date: getCell(row, "Purchase_Date", "Purchase_Date", "Last purchase date", "Last_Purchase_Date"),
      Purchase_Amount: getCell(row, "Purchase_Amount", "Purchase_Amount", "Total purchase amount", "Total_Purchase_Amount"),
      Age: getAgeFromDob(getCell(row, "DOB", "dob")),
      "Last purchase date": getCell(row, "Last purchase date", "Last_Purchase_Date", "LastPurchaseDate"),
      "Total purchase amount": getCell(row, "Total purchase amount", "Total_Purchase_Amount", "TotalPurchaseAmount"),
    });
  }

  async function handleSaveEdit() {
    const id = editingClient ? getRecordId(editingClient) : null;
    if (!id) return;
    const name = String(editForm.Name ?? "").trim();
    const whatsapp = String(editForm.Whatsapp_number ?? "").trim();
    const gender = String(editForm.Gender ?? "").trim();
    if (!name || !whatsapp || !gender) {
      alert("Name, WhatsApp number, and Gender are required");
      return;
    }
    setIsEditingSaving(true);
    try {
      const payload: Record<string, unknown> = {
        Name: name,
        Whatsapp_number: whatsapp,
        Gender: gender,
      };
      if (editForm.DOB != null && String(editForm.DOB).trim()) payload.DOB = String(editForm.DOB).trim();
      if (editForm.Tags != null && String(editForm.Tags).trim()) payload.Tags = String(editForm.Tags).trim();
      const ef = editForm as Record<string, unknown>;
      const lastPurchaseDate = String(editForm.Purchase_Date ?? ef["Last purchase date"] ?? "").trim();
      const totalPurchaseAmount = String(editForm.Purchase_Amount ?? ef["Total purchase amount"] ?? "").trim();
      if (lastPurchaseDate) payload.Purchase_Date = lastPurchaseDate;
      if (totalPurchaseAmount) payload.Purchase_Amount = totalPurchaseAmount;

      const res = await fetch(`/api/clients/${encodeURIComponent(String(id))}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Update failed");
      setEditingClient(null);
      fetchClients();
    } catch (e) {
      alert("Failed to update customer. Please try again.");
      console.error(e);
    } finally {
      setIsEditingSaving(false);
    }
  }

  async function handleDeleteClient(row: ClientRecord) {
    const id = getRecordId(row);
    if (!id) {
      alert("Cannot delete: missing record id");
      return;
    }
    const name = getClientValue(row, "Name") || "this customer";
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setIsDeletingId(id);
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(String(id))}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setEditingClient(null);
      fetchClients();
    } catch (e) {
      alert("Failed to delete customer. Please try again.");
      console.error(e);
    } finally {
      setIsDeletingId(null);
    }
  }

  function getClientValue(row: ClientRecord, key: keyof ClientRecord): string {
    const r = row as Record<string, unknown>;
    const v = r[key as string] ?? r[(key as string).replace(/ /g, "_")] ?? r[(key as string).replace(/_/g, " ")];
    return v != null ? String(v) : "";
  }

  function getCell(row: ClientRecord, ...keys: string[]): string {
    const r = row as Record<string, unknown>;
    for (const k of keys) {
      const v = r[k];
      if (v != null && v !== "") return String(v);
    }
    return "";
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">
            Customer List
          </h2>
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Search name or WhatsApp..."
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[var(--montresor-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--montresor-accent)]"
            />
            <button
              type="button"
              onClick={fetchClients}
              disabled={clientsLoading}
              className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {clientsLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
        {clientsLoading ? (
          <p className="mt-4 text-sm text-slate-500">Loading customers…</p>
        ) : clients.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No customers yet. Upload CSV or add manually.</p>
        ) : filteredClients.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No customers match your search.</p>
        ) : (
          <div className="mt-4 max-h-[500px] overflow-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-3 py-2 text-left font-medium text-slate-700">Name</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-700">WhatsApp</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-700">Gender</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-700">Age</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-700">Last purchase date</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-700">Total purchase amount</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-700">Tags</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((row, i) => (
                  <tr
                    key={
                      (row as Record<string, unknown>).Id ??
                      getClientValue(row, "Client ID") ||
                      getClientValue(row, "Client_ID") ||
                      i
                    }
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-3 py-2 text-slate-900">{getClientValue(row, "Name")}</td>
                    <td className="px-3 py-2 text-slate-600">{getClientValue(row, "Whatsapp_number")}</td>
                    <td className="px-3 py-2 text-slate-600">{getClientValue(row, "Gender")}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {getAgeFromDob(getCell(row, "DOB", "dob")) || "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {getCell(row, "Last purchase date", "Last_Purchase_Date", "LastPurchaseDate", "Purchase_Date")}
                    </td>
                    <td className="px-3 py-2 text-slate-600 tabular-nums">
                      {formatMoney(getCell(row, "Total purchase amount", "Total_Purchase_Amount", "TotalPurchaseAmount", "Purchase_Amount"))}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{getClientValue(row, "Tags")}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(row)}
                          disabled={isDeletingId !== null}
                          className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteClient(row)}
                          disabled={isDeletingId !== null}
                          className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {isDeletingId === getRecordId(row) ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Edit customer</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Name *</label>
                <input
                  value={String(editForm.Name ?? "")}
                  onChange={(e) => setEditForm((p) => ({ ...p, Name: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[var(--montresor-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--montresor-accent)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">WhatsApp number *</label>
                <div className="flex gap-2">
                  <select
                    value={parseWhatsAppNumber(String(editForm.Whatsapp_number ?? "")).prefix}
                    onChange={(e) => {
                      const { local } = parseWhatsAppNumber(String(editForm.Whatsapp_number ?? ""));
                      setEditForm((p) => ({ ...p, Whatsapp_number: e.target.value + local }));
                    }}
                    className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {WHATSAPP_PREFIXES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    value={parseWhatsAppNumber(String(editForm.Whatsapp_number ?? "")).local}
                    onChange={(e) => {
                      const { prefix } = parseWhatsAppNumber(String(editForm.Whatsapp_number ?? ""));
                      setEditForm((p) => ({ ...p, Whatsapp_number: prefix + e.target.value.replace(/\D/g, "") }));
                    }}
                    placeholder="12345678"
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Gender *</label>
                <select
                  value={String(editForm.Gender ?? "")}
                  onChange={(e) => setEditForm((p) => ({ ...p, Gender: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                    <option value="">Select</option>
                    <option value="M">M</option>
                    <option value="F">F</option>
                  </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">DOB (Date of birth)</label>
                <input
                  type="date"
                  value={String(editForm.DOB ?? "").slice(0, 10)}
                  onChange={(e) => setEditForm((p) => ({ ...p, DOB: e.target.value || undefined }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Age</label>
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {getAgeFromDob(String(editForm.DOB ?? "")) || "—"}
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Tags</label>
                <input
                  value={String(editForm.Tags ?? "")}
                  onChange={(e) => setEditForm((p) => ({ ...p, Tags: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Last purchase date</label>
                <input
                  type="date"
                  value={String(editForm.Purchase_Date ?? (editForm as Record<string, unknown>)["Last purchase date"] ?? "").slice(0, 10)}
                  onChange={(e) => {
                    const v = e.target.value || undefined;
                    setEditForm((p) => ({ ...p, Purchase_Date: v, "Last purchase date": v ?? "" }));
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Total purchase amount</label>
                <input
                  value={String(editForm.Purchase_Amount ?? (editForm as Record<string, unknown>)["Total purchase amount"] ?? "")}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEditForm((p) => ({ ...p, Purchase_Amount: v, "Total purchase amount": v }));
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setEditingClient(null)}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isEditingSaving}
                className="flex-1 rounded-lg bg-[var(--montresor-accent)] px-4 py-2 text-sm font-medium text-slate-900 hover:opacity-90 disabled:opacity-60"
              >
                {isEditingSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Upload customer list (CSV)
          </h2>
        </div>

        <div className="mt-4 space-y-4">
          <input
            type="file"
            accept=".csv"
            onChange={(e) => handleCsvChange(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
          {csvFileName && (
            <p className="text-sm text-slate-600">
              {csvFileName} · {csvCount} row(s) detected
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleCsvUpload}
              disabled={isCsvUploading || csvCount === 0}
              className="rounded-lg bg-[var(--montresor-accent)] px-4 py-2 text-sm font-medium text-slate-900 transition hover:opacity-90 disabled:opacity-60"
            >
              {isCsvUploading ? "Uploading…" : "Upload CSV"}
            </button>
            <button
              type="button"
              onClick={handleCopyCsvTemplate}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Copy CSV template
            </button>
            {copyFeedback === "copied" && (
              <span className="text-sm text-emerald-700">Copied!</span>
            )}
            {copyFeedback === "error" && (
              <span className="text-sm text-red-600">Copy failed. Try selecting the text below.</span>
            )}
            <button
              type="button"
              onClick={() => setShowManualForm((v) => !v)}
              className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[var(--montresor-accent)] bg-transparent text-xl font-light text-slate-900 transition hover:bg-[var(--montresor-accent)] hover:bg-opacity-10"
              aria-label={showManualForm ? "Close add customer form" : "Add customer manually"}
              title={showManualForm ? "Close form" : "Add customer manually"}
            >
              +
            </button>
          </div>
          {csvStatus.error && (
            <p className="text-sm text-red-600">{csvStatus.error}</p>
          )}
          {csvStatus.inserted != null && (
            <p className="text-sm text-emerald-700">
              Added {csvStatus.inserted} customer(s) to Clients.
              {csvStatus.skipped != null && csvStatus.skipped > 0 && (
                <> Skipped {csvStatus.skipped} duplicate WhatsApp number(s).</>
              )}
            </p>
          )}
        </div>

        {showManualForm && (
          <>
            <div className="mt-8 border-t border-slate-200 pt-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Add customer manually
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowManualForm(false)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                  aria-label="Close form"
                >
                  −
                </button>
              </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {clientFields.map((field) => {
            if (field.key === "Whatsapp_number") {
              const { prefix, local } = parseWhatsAppNumber(
                String(manual.Whatsapp_number ?? "")
              );
              return (
                <div
                  key={field.key}
                  className="space-y-1 sm:col-span-2"
                >
                  <span className="text-sm font-medium text-slate-700">
                    {field.label} <span className="text-red-500">*</span>
                  </span>
                  <div className="mt-1 flex gap-2">
                    <select
                      value={prefix}
                      onChange={(e) => {
                        const newPrefix = e.target.value as (typeof WHATSAPP_PREFIXES)[number];
                        const full = newPrefix + local;
                        updateManualField("Whatsapp_number", full || "");
                      }}
                      className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[var(--montresor-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--montresor-accent)]"
                    >
                      {WHATSAPP_PREFIXES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      value={local}
                      onChange={(e) => {
                        const localVal = e.target.value.replace(/\D/g, "");
                        const full = prefix + localVal;
                        updateManualField("Whatsapp_number", full || "");
                      }}
                      placeholder="12345678"
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[var(--montresor-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--montresor-accent)]"
                    />
                  </div>
                </div>
              );
            }
            if (field.key === "Gender") {
              return (
                <label
                  key={field.key}
                  className="text-sm font-medium text-slate-700"
                >
                  {field.label} <span className="text-red-500">*</span>
                  <select
                    value={String(manual.Gender ?? "")}
                    onChange={(e) =>
                      updateManualField("Gender", e.target.value)
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[var(--montresor-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--montresor-accent)]"
                  >
                    <option value="">Select</option>
                    <option value="M">M</option>
                    <option value="F">F</option>
                  </select>
                </label>
              );
            }
            if (field.key === "DOB") {
              const { year, month, day } = parseDate(
                String(manual.DOB ?? "")
              );
              const selectClass =
                "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[var(--montresor-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--montresor-accent)]";
              return (
                <div key={field.key} className="space-y-1">
                  <span className="text-sm font-medium text-slate-700">
                    {field.label}
                  </span>
                  <div className="mt-1 flex gap-2">
                    <select
                      value={year}
                      onChange={(e) =>
                        updateManualField(
                          "DOB",
                          toYYYYMMDD(e.target.value, month, day)
                        )
                      }
                      className={`flex-1 ${selectClass}`}
                    >
                      {getYearOptions(true).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={month}
                      onChange={(e) =>
                        updateManualField(
                          "DOB",
                          toYYYYMMDD(year, e.target.value, day)
                        )
                      }
                      className={`w-20 ${selectClass}`}
                    >
                      {MONTHS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={day}
                      onChange={(e) =>
                        updateManualField(
                          "DOB",
                          toYYYYMMDD(year, month, e.target.value)
                        )
                      }
                      className={`w-20 ${selectClass}`}
                    >
                      {getDayOptions().map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            }
            if (field.key === "Purchase_Date") {
              const { year, month, day } = parseDate(
                String(manual.Purchase_Date ?? "")
              );
              const selectClass =
                "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[var(--montresor-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--montresor-accent)]";
              return (
                <div key={field.key} className="space-y-1">
                  <span className="text-sm font-medium text-slate-700">
                    {field.label}
                  </span>
                  <div className="mt-1 flex gap-2">
                    <select
                      value={year}
                      onChange={(e) =>
                        updateManualField(
                          "Purchase_Date",
                          toYYYYMMDD(e.target.value, month, day)
                        )
                      }
                      className={`flex-1 ${selectClass}`}
                    >
                      {getYearOptions(false).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={month}
                      onChange={(e) =>
                        updateManualField(
                          "Purchase_Date",
                          toYYYYMMDD(year, e.target.value, day)
                        )
                      }
                      className={`w-20 ${selectClass}`}
                    >
                      {MONTHS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={day}
                      onChange={(e) =>
                        updateManualField(
                          "Purchase_Date",
                          toYYYYMMDD(year, month, e.target.value)
                        )
                      }
                      className={`w-20 ${selectClass}`}
                    >
                      {getDayOptions().map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            }
            return (
              <label
                key={field.key}
                className="text-sm font-medium text-slate-700"
              >
                {field.label}
                {field.key === "Name" && <span className="text-red-500"> *</span>}
                <input
                  value={String(manual[field.key] ?? "")}
                  onChange={(e) =>
                    updateManualField(field.key, e.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[var(--montresor-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--montresor-accent)]"
                  placeholder=""
                />
              </label>
            );
          })}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={handleManualSubmit}
            disabled={
              isManualSaving ||
              !String(manual.Name ?? "").trim() ||
              !String(manual.Whatsapp_number ?? "").trim() ||
              !String(manual.Gender ?? "").trim()
            }
            className="rounded-lg bg-[var(--montresor-accent)] px-4 py-2 text-sm font-medium text-slate-900 transition hover:opacity-90 disabled:opacity-60"
          >
            {isManualSaving ? "Saving…" : "Save customer"}
          </button>
          {manualStatus.error && (
            <p className="text-sm text-red-600">{manualStatus.error}</p>
          )}
          {manualStatus.inserted && (
            <p className="text-sm text-emerald-700">Customer saved.</p>
          )}
        </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
