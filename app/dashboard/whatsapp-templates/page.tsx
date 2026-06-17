"use client";

import { useState, useEffect, useMemo } from "react";
import { isScamReportApproved } from "@/lib/nocodb-scam-report";
import { IncidentDatePicker } from "./incident-date-picker";
import { DashboardPageBanner } from "@/components/dashboard-page-banner";
import {
  PortalScamReportsTable,
  type PortalScamReportItem,
} from "./portal-scam-reports-table";

interface TemplateListItem extends PortalScamReportItem {
  language: string;
  category?: string;
}

interface LocalImageUpload {
  file: File;
  previewUrl: string;
}

interface StoredReportImage {
  previewUrl: string;
  attachment: unknown[];
}

function toRecordId(value: unknown): string | number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value).trim();
  return text || null;
}

/** Presigned NocoDB/S3 URLs load directly; unsigned S3 urls go through proxy. */
function getPhotoSrc(url: string): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (/^IMG_/.test(trimmed)) return `/api/photos/${encodeURIComponent(trimmed)}`;
  if (/X-Amz-Signature=/i.test(trimmed) && /X-Amz-Expires=/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) {
    return `/api/photos/proxy?url=${encodeURIComponent(trimmed)}`;
  }
  if (trimmed.includes("amazonaws.com") || (trimmed.includes("s3.") && trimmed.includes("nocohub"))) {
    return `/api/photos/proxy?url=${encodeURIComponent(trimmed)}`;
  }
  if (trimmed.includes("nocodb")) {
    return `/api/photos/proxy?url=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}

function formatReportDate(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  return trimmed;
}

function displayDateToIso(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return trimmed.slice(0, 10);

  const displayMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!displayMatch) return "";

  const day = displayMatch[1].padStart(2, "0");
  const month = displayMatch[2].padStart(2, "0");
  const year = displayMatch[3];
  return `${year}-${month}-${day}`;
}

function toDatePickerValue(value: string | undefined): string {
  if (!value?.trim()) return "";
  return displayDateToIso(value.trim());
}

function ImageIcon({ className }: { className?: string }) {
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
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function MailIcon({ className }: { className?: string }) {
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
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function OpenMailIcon({ className }: { className?: string }) {
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
      <path d="M21.5 2h-19A1.5 1.5 0 0 0 1 3.5v17A1.5 1.5 0 0 0 2.5 22h19a1.5 1.5 0 0 0 1.5-1.5v-17A1.5 1.5 0 0 0 21.5 2z" />
      <polyline points="1 3.5 12 14 23 3.5" />
      <line x1="1" y1="3.5" x2="12" y2="14" />
      <line x1="23" y1="3.5" x2="12" y2="14" />
    </svg>
  );
}

const READ_ADMIN_COMMENTS_KEY = "aisds-read-admin-comments";

function DocumentIcon({ className }: { className?: string }) {
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
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

export default function WhatsAppTemplatesPage() {
  const [showCreateTemplateModal, setShowCreateTemplateModal] = useState(false);

  // Create Template form
  const [reportDate, setReportDate] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [contactDetail, setContactDetail] = useState("");
  const [scamMessageText, setScamMessageText] = useState("");
  const [language, setLanguage] = useState("");
  const [region, setRegion] = useState("");
  const [storedReportImages, setStoredReportImages] = useState<StoredReportImage[]>([]);
  const [initialStoredImageCount, setInitialStoredImageCount] = useState(0);
  const [localImageUploads, setLocalImageUploads] = useState<LocalImageUpload[]>([]);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);

  // Template list (below Template Management)
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | number | null>(null);
  const [isDeletingTemplateId, setIsDeletingTemplateId] = useState<string | number | null>(null);
  const [adminCommentDialog, setAdminCommentDialog] = useState<{
    reportId: string;
    templateName: string;
    message: string;
  } | null>(null);
  const [readAdminComments, setReadAdminComments] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(READ_ADMIN_COMMENTS_KEY);
      if (raw) setReadAdminComments(JSON.parse(raw) as Record<string, string>);
    } catch {
      /* ignore invalid storage */
    }
  }, []);

  function isAdminCommentRead(reportId: unknown, comment: string): boolean {
    if (reportId == null || reportId === "") return false;
    return readAdminComments[String(reportId)] === comment.trim();
  }

  function openAdminCommentDialog(t: TemplateListItem) {
    const reportId = String(t.id ?? "");
    const message = t.adminComment?.trim() ?? "";
    if (!reportId || !message) return;

    setAdminCommentDialog({
      reportId,
      templateName: t.templateName || "Scam report",
      message,
    });

    const next = { ...readAdminComments, [reportId]: message };
    setReadAdminComments(next);
    try {
      localStorage.setItem(READ_ADMIN_COMMENTS_KEY, JSON.stringify(next));
    } catch {
      /* ignore storage errors */
    }
  }

  function fetchTemplates() {
    setTemplatesLoading(true);
    fetch("/api/scam-reports", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { templates?: TemplateListItem[] }) => setTemplates(data.templates ?? []))
      .catch(() => setTemplates([]))
      .finally(() => setTemplatesLoading(false));
  }

  useEffect(() => {
    fetchTemplates();
  }, []);

  const myUploadedReports = useMemo(
    () =>
      templates.filter(
        (report) =>
          report.canEdit && !isScamReportApproved(report.status ?? report.category ?? "")
      ),
    [templates]
  );

  const approvedReports = useMemo(
    () =>
      templates.filter((report) => isScamReportApproved(report.status ?? report.category ?? "")),
    [templates]
  );

  function resetTemplateForm() {
    setReportDate("");
    setMessageBody("");
    setContactDetail("");
    setScamMessageText("");
    setLanguage("");
    setRegion("");
    setStoredReportImages([]);
    setInitialStoredImageCount(0);
    setLocalImageUploads((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
    setEditingTemplateId(null);
  }

  async function handleEditTemplate(t: TemplateListItem) {
    const id = t.id;
    if (isScamReportApproved(t.status ?? t.category ?? "")) {
      alert("Approved reports cannot be edited.");
      return;
    }
    if (!t.canEdit) {
      alert("You can only edit scam reports that you submitted.");
      return;
    }
    if (id == null || id === "") {
      alert("This template cannot be edited: missing record ID. Please refresh the list.");
      return;
    }
    const recordId = toRecordId(id);
    if (recordId == null) {
      alert("This template cannot be edited: missing record ID. Please refresh the list.");
      return;
    }
    try {
      const idStr = String(recordId).trim();
      const res = await fetch(`/api/scam-reports/${encodeURIComponent(idStr)}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load template");
      const data = (await res.json()) as {
        templateName?: string;
        messageBody?: string;
        reportDate?: string;
        description?: string;
        contactDetail?: string;
        scamMessageText?: string;
        language?: string;
        region?: string;
        image1?: string;
        image2?: string;
        image3?: string;
        image4?: string;
        image1Attachment?: unknown[];
        image2Attachment?: unknown[];
        image3Attachment?: unknown[];
        image4Attachment?: unknown[];
      };
      const storedImages = (
        [
          { previewUrl: data.image1, attachment: data.image1Attachment },
          { previewUrl: data.image2, attachment: data.image2Attachment },
          { previewUrl: data.image3, attachment: data.image3Attachment },
          { previewUrl: data.image4, attachment: data.image4Attachment },
        ] as Array<{ previewUrl?: string; attachment?: unknown[] }>
      )
        .filter((slot) => slot.previewUrl && Array.isArray(slot.attachment) && slot.attachment.length > 0)
        .map((slot) => ({
          previewUrl: slot.previewUrl as string,
          attachment: slot.attachment as unknown[],
        }));

      setReportDate(toDatePickerValue(data.reportDate));
      setMessageBody(data.description?.trim() ?? data.messageBody?.trim() ?? "");
      setContactDetail(data.contactDetail?.trim() ?? "");
      setScamMessageText(data.scamMessageText?.trim() ?? "");
      setLanguage(data.language ?? "");
      setRegion(data.region ?? "");
      setStoredReportImages(storedImages);
      setInitialStoredImageCount(storedImages.length);
      setEditingTemplateId(recordId);
      setShowCreateTemplateModal(true);
    } catch (e) {
      alert("Failed to load template for editing.");
      console.error(e);
    }
  }

  async function handleDeleteTemplate(t: TemplateListItem) {
    const id = t.id;
    if (isScamReportApproved(t.status ?? t.category ?? "")) {
      alert("Approved reports cannot be deleted.");
      return;
    }
    if (!t.canEdit) {
      alert("You can only delete scam reports that you submitted.");
      return;
    }
    if (id == null || id === "") {
      alert("This template cannot be deleted: missing record ID. Please refresh the list.");
      return;
    }
    const recordId = toRecordId(id);
    if (recordId == null) {
      alert("This template cannot be deleted: missing record ID. Please refresh the list.");
      return;
    }
    if (!confirm(`Delete template "${t.templateName || "Untitled"}"? This cannot be undone.`)) return;
    setIsDeletingTemplateId(recordId);
    try {
      const idStr = String(recordId).trim();
      const res = await fetch(`/api/scam-reports/${encodeURIComponent(idStr)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      fetchTemplates();
    } catch (e) {
      alert("Failed to delete template.");
      console.error(e);
    } finally {
      setIsDeletingTemplateId(null);
    }
  }

  function removeStoredImage(index: number) {
    setStoredReportImages((prev) => prev.filter((_, i) => i !== index));
  }

  function removeLocalUpload(index: number) {
    setLocalImageUploads((prev) => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  }

  function handleLocalImageSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const remainingSlots = 4 - (storedReportImages.length + localImageUploads.length);
    if (remainingSlots <= 0) {
      alert("You can upload up to 4 images only");
      event.target.value = "";
      return;
    }
    const validFiles = files.filter((file) => file.type.startsWith("image/")).slice(0, remainingSlots);
    setLocalImageUploads((prev) => [
      ...prev,
      ...validFiles.map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
    event.target.value = "";
  }

  async function uploadLocalImage(file: File): Promise<{ url: string; attachment: unknown[] }> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/scam-reports/upload-image", {
      method: "POST",
      body: formData,
    });
    if (!response.ok) throw new Error("Failed to upload one or more images");
    const data = (await response.json()) as { attachment?: unknown[]; url?: string };
    if (!data.attachment?.length) throw new Error("Image upload returned no attachment");
    return { url: data.url ?? "", attachment: data.attachment };
  }

  async function handleCreateTemplate() {
    if (!language.trim()) {
      alert("Scam Type is required");
      return;
    }

    setIsCreatingTemplate(true);
    try {
      const normalizedReportDate = displayDateToIso(reportDate.trim());
      const normalizedDescription = messageBody.trim();
      const uploadedAttachments: unknown[] = [];
      for (const localImage of localImageUploads) {
        const uploaded = await uploadLocalImage(localImage.file);
        uploadedAttachments.push(uploaded.attachment);
      }

      const isEdit = editingTemplateId != null;
      const imagesChanged =
        localImageUploads.length > 0 || storedReportImages.length !== initialStoredImageCount;

      const payload: Record<string, unknown> = {
        scamType: language.trim(),
        reportDate: normalizedReportDate,
        description: normalizedDescription,
        contactDetail: contactDetail.trim() || undefined,
        scamMessageText: scamMessageText.trim() || undefined,
        platform: region.trim() || undefined,
      };

      if (!isEdit || imagesChanged) {
        const allImageValues = [
          ...storedReportImages.map((image) => image.attachment),
          ...uploadedAttachments,
        ].slice(0, 4);
        payload.image1 = allImageValues[0] ?? null;
        payload.image2 = allImageValues[1] ?? null;
        payload.image3 = allImageValues[2] ?? null;
        payload.image4 = allImageValues[3] ?? null;
      }

      const url = isEdit
        ? `/api/scam-reports/${encodeURIComponent(String(editingTemplateId))}`
        : "/api/scam-reports";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? (isEdit ? "Update failed" : "Create failed"));
      }

      alert(isEdit ? "Scam report updated successfully!" : "Scam report created successfully!");
      setShowCreateTemplateModal(false);
      resetTemplateForm();
      fetchTemplates();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save template");
    } finally {
      setIsCreatingTemplate(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <DashboardPageBanner
        title="Report Scam"
        subtitle="Submit and manage your scam case reports."
      />

      <div className="rounded-2xl border border-emerald-200/45 bg-white/25 p-8 shadow-lg shadow-emerald-900/5 backdrop-blur-md">
        <div className="flex flex-wrap justify-center gap-4">
          <button
            type="button"
            onClick={() => {
              resetTemplateForm();
              setShowCreateTemplateModal(true);
            }}
            className="flex h-44 w-44 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-emerald-300/80 bg-white/30 text-emerald-900 backdrop-blur-sm transition-all hover:border-emerald-500 hover:bg-white/45 hover:shadow-md"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm">
              <DocumentIcon className="h-8 w-8" />
            </div>
            <span className="text-center text-[1.125rem] font-semibold">
              Scam Report
            </span>
          </button>
        </div>
      </div>

      {templatesLoading ? (
        <div className="rounded-2xl border border-emerald-200/45 bg-white/25 p-8 text-center shadow-lg shadow-emerald-900/5 backdrop-blur-md">
          <p className="text-[1.3125rem] text-slate-600">Loading scam reports…</p>
        </div>
      ) : (
        <div className="space-y-8">
          <PortalScamReportsTable
            title="Approved scam reports"
            subtitle="Scam cases approved by admin and visible to all users."
            emptyMessage="No approved scam reports yet."
            reports={approvedReports}
            deletingId={isDeletingTemplateId}
            onEdit={handleEditTemplate}
            onDelete={handleDeleteTemplate}
            onOpenAdminComment={openAdminCommentDialog}
            isAdminCommentRead={isAdminCommentRead}
          />
          <PortalScamReportsTable
            title="My scam reports"
            subtitle="Your submitted reports that are still pending admin review."
            emptyMessage='No pending reports. Create one via "Scam Report" above.'
            reports={myUploadedReports}
            deletingId={isDeletingTemplateId}
            onEdit={handleEditTemplate}
            onDelete={handleDeleteTemplate}
            onOpenAdminComment={openAdminCommentDialog}
            isAdminCommentRead={isAdminCommentRead}
          />
        </div>
      )}

      {/* Create Template Modal */}
      {showCreateTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-8 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">
              {editingTemplateId != null ? "Edit Template" : "Scam Report"}
            </h3>
            <p className="mb-6 text-sm text-slate-600">
              {editingTemplateId != null
                ? "Update this scam report. You can upload up to 4 images from your local device."
                : "Create a scam report and upload up to 4 images from your local device."}
            </p>

            <div className="mb-6 max-h-[60vh] space-y-4 overflow-y-auto pr-2">
              <div className="grid gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Scam Type *
                  </label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">Select scam type</option>
                    <option value="Impersonation Scams">Impersonation Scams</option>
                    <option value="Recruitment / Job Scam">Recruitment / Job Scam</option>
                    <option value="Romance Scam">Romance Scam</option>
                    <option value="Investment / Crypto Scam">Investment / Crypto Scam</option>
                    <option value="Delivery / Logistics Scam">Delivery / Logistics Scam</option>
                    <option value="Banking / Phishing Scam">Banking / Phishing Scam</option>
                    <option value="Government / Authority Scam">Government / Authority Scam</option>
                    <option value="Others">Others</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Date of Incident
                </label>
                <IncidentDatePicker
                  value={reportDate}
                  onChange={setReportDate}
                  maxDate={new Date().toISOString().slice(0, 10)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Description
                </label>
                <textarea
                  rows={4}
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  placeholder="Enter your message content..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Contact Detail
                </label>
                <input
                  type="text"
                  value={contactDetail}
                  onChange={(e) => setContactDetail(e.target.value)}
                  placeholder="Phone number, email, or other contact info"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Scam SMS / Message
                </label>
                <textarea
                  rows={4}
                  value={scamMessageText}
                  onChange={(e) => setScamMessageText(e.target.value)}
                  placeholder="Paste the scam SMS or message you received..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="grid gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Location
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setRegion("Hong Kong")}
                      aria-pressed={region === "Hong Kong"}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                        region === "Hong Kong"
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:border-emerald-400 hover:text-emerald-700"
                      }`}
                    >
                      Hong Kong
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegion("Outside Hong Kong")}
                      aria-pressed={region === "Outside Hong Kong"}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                        region === "Outside Hong Kong"
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:border-emerald-400 hover:text-emerald-700"
                      }`}
                    >
                      Outside Hong Kong
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <span className="mb-2 block text-sm font-medium text-slate-700">
                  Images
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  {storedReportImages.map((image, index) => {
                    return (
                      <div
                        key={`saved-image-${image.previewUrl}-${index}`}
                        className="relative flex flex-col items-center rounded-lg border border-slate-200 bg-slate-50 p-2"
                      >
                        <div className="relative h-20 w-20 overflow-hidden rounded-md bg-slate-200">
                          <img
                            src={getPhotoSrc(image.previewUrl)}
                            alt={`Image ${index + 1}`}
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                              const fallback = e.currentTarget.nextElementSibling;
                              if (fallback) (fallback as HTMLElement).style.display = "flex";
                            }}
                          />
                          <div
                            className="hidden h-full w-full items-center justify-center"
                            style={{ display: "none" }}
                            aria-hidden
                          >
                            <ImageIcon className="h-8 w-8 text-slate-400" />
                          </div>
                        </div>
                        <span className="mt-1 max-w-[100px] truncate text-xs text-slate-600">
                          {`Image ${index + 1}`}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeStoredImage(index)}
                          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
                          aria-label="Remove image"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                  {localImageUploads.map((item, index) => (
                    <div
                      key={`local-image-${item.previewUrl}-${index}`}
                      className="relative flex flex-col items-center rounded-lg border border-slate-200 bg-slate-50 p-2"
                    >
                      <div className="relative h-20 w-20 overflow-hidden rounded-md bg-slate-200">
                        <img
                          src={item.previewUrl}
                          alt={item.file.name || `Upload ${index + 1}`}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <span className="mt-1 max-w-[100px] truncate text-xs text-slate-600">
                        {item.file.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeLocalUpload(index)}
                        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
                        aria-label="Remove image"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-2">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleLocalImageSelect}
                    disabled={storedReportImages.length + localImageUploads.length >= 4}
                    className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    {storedReportImages.length + localImageUploads.length}/4 images selected.
                  </p>
                </div>
              </div>

            </div>

            <div className="flex gap-3 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowCreateTemplateModal(false);
                  resetTemplateForm();
                }}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateTemplate}
                disabled={isCreatingTemplate}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {isCreatingTemplate
                  ? editingTemplateId != null
                    ? "Saving..."
                    : "Creating..."
                  : editingTemplateId != null
                    ? "Save"
                    : "Scam Report"}
              </button>
            </div>
          </div>
        </div>
      )}

      {adminCommentDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-comment-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <OpenMailIcon className="h-5 w-5" />
              </div>
              <div>
                <h3 id="admin-comment-title" className="text-lg font-semibold text-slate-900">
                  Admin Message
                </h3>
                <p className="mt-0.5 text-sm text-slate-500">{adminCommentDialog.templateName}</p>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
              {adminCommentDialog.message}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setAdminCommentDialog(null)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
