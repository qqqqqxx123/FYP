"use server";

import {
  createClients,
  getExistingClientWhatsAppNumbers,
  type ClientRecord,
} from "@/lib/nocodb";
import { z } from "zod";

const clientSchema = z
  .object({
    "Client ID": z.string().optional(),
    Name: z.string().optional(),
    Whatsapp_number: z.string().optional(),
    Gender: z.string().optional(),
    DOB: z.string().optional(),
    Tags: z.string().optional(),
    Purchase_Date: z.string().optional(),
    Purchase_Amount: z.union([z.string(), z.number()]).optional(),
  })
  .partial();

const clientFields = [
  "Client ID",
  "Name",
  "Whatsapp_number",
  "Gender",
  "DOB",
  "Tags",
  "Purchase_Date",
  "Purchase_Amount",
] as const;

const fieldAliases: Record<string, (typeof clientFields)[number]> = {
  Client_ID: "Client ID",
  "Client ID": "Client ID",
  Name: "Name",
  Whatsapp_number: "Whatsapp_number",
  "Whatsapp number": "Whatsapp_number",
  Gender: "Gender",
  DOB: "DOB",
  Tags: "Tags",
  Purchase_Date: "Purchase_Date",
  "Purchase Date": "Purchase_Date",
  Purchase_Amount: "Purchase_Amount",
  "Purchase Amount": "Purchase_Amount",
};

function normalizeRecord(input: Record<string, unknown>): ClientRecord {
  const record: ClientRecord = {};

  for (const field of clientFields) {
    const value =
      input[field] ??
      input[
        Object.keys(fieldAliases).find(
          (alias) => fieldAliases[alias] === field
        ) ?? ""
      ];
    if (value === undefined || value === null || value === "") continue;
    if (field === "Purchase_Amount") {
      const numeric = typeof value === "string" ? Number(value) : value;
      record[field] = Number.isNaN(numeric) ? String(value) : numeric;
      continue;
    }
    record[field] = String(value).trim();
  }

  return record;
}

function isEmptyRecord(record: ClientRecord) {
  return clientFields.every(
    (field) => record[field] === undefined || record[field] === ""
  );
}

function generateClientId(): string {
  return `C-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ensureClientId(record: ClientRecord): ClientRecord {
  const hasId =
    (record["Client ID"] ?? record.Client_ID ?? "").toString().trim() !== "";
  if (hasId) return record;
  const id = generateClientId();
  return { ...record, "Client ID": id };
}

/** Normalize Gender to M/F so CSV and manual entries match. */
function normalizeGender(value: string): string {
  const v = value.trim().toLowerCase();
  if (v === "m" || v === "male") return "M";
  if (v === "f" || v === "female") return "F";
  return value.trim();
}

/** Ensure WhatsApp number has country code so CSV and manual match (default +852). */
function normalizeWhatsApp(value: string): string {
  const digits = value.trim().replace(/\s/g, "");
  if (!digits) return "";
  if (digits.startsWith("+")) return digits;
  return `+852${digits}`;
}

function normalizeFormats(record: ClientRecord): ClientRecord {
  const out = { ...record };
  if (out.Gender != null && String(out.Gender).trim() !== "")
    out.Gender = normalizeGender(String(out.Gender));
  if (out.Whatsapp_number != null && String(out.Whatsapp_number).trim() !== "")
    out.Whatsapp_number = normalizeWhatsApp(String(out.Whatsapp_number));
  return out;
}

/** Normalize WhatsApp for duplicate check (digits only). */
function whatsAppKey(value: string): string {
  return (value ?? "").replace(/\D/g, "").trim();
}

export interface CreateClientsState {
  error?: string;
  inserted?: number;
  skipped?: number;
}

export async function createClientsAction(
  formData: FormData
): Promise<CreateClientsState> {
  const payload = formData.get("payload");
  if (!payload || typeof payload !== "string") {
    return { error: "No data provided." };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return { error: "Invalid JSON payload." };
  }

  const list = Array.isArray(raw) ? raw : [raw];
  const normalized = list
    .filter((row) => typeof row === "object" && row !== null)
    .map((row) => normalizeRecord(row as Record<string, unknown>))
    .map((row) => ensureClientId(row))
    .map((row) => normalizeFormats(row))
    .filter((row) => clientSchema.safeParse(row).success)
    .filter((row) => !isEmptyRecord(row));

  if (!normalized.length) return { error: "No valid rows found." };

  const existingNumbers = await getExistingClientWhatsAppNumbers();
  const seenInBatch = new Set<string>();
  const toInsert: ClientRecord[] = [];

  for (const record of normalized) {
    const num = String(record.Whatsapp_number ?? "").trim();
    if (!num) continue;
    const key = whatsAppKey(num);
    if (existingNumbers.has(key) || seenInBatch.has(key)) continue;
    seenInBatch.add(key);
    toInsert.push(record);
  }

  if (normalized.length === 1 && toInsert.length === 0) {
    return {
      error: "This WhatsApp number is already in the database.",
    };
  }

  if (!toInsert.length) {
    return {
      inserted: 0,
      skipped: normalized.length,
    };
  }

  try {
    const result = await createClients(toInsert);
    return {
      inserted: result.inserted,
      skipped: normalized.length - result.inserted,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add clients";
    return { error: message };
  }
}
