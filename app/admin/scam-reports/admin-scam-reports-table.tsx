"use client";

import type { ScamReportListItem, ScamReportStatus } from "@/lib/nocodb-scam-report";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import {
  deleteScamReportAction,
  updateScamReportAdminCommentAction,
  updateScamReportStatusAction,
} from "./actions";

interface AdminScamReportsTableProps {
  reports: ScamReportListItem[];
}

const tableTextClass = "text-[1.3125rem] leading-snug";
const tableCellClass = "px-6 py-4";
const tableBodyCellClass = `${tableCellClass} border-r border-indigo-200 last:border-r-0`;
const tableHeaderCellClass = `${tableCellClass} border-r border-indigo-400/50 last:border-r-0 font-semibold text-white`;
const tableControlClass =
  "rounded-lg border px-[0.75rem] py-[0.5625rem] text-[1.125rem] font-medium outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60";
const commentIconButtonClass =
  "inline-flex h-11 w-11 items-center justify-center rounded-full border border-indigo-200 bg-white text-indigo-700 shadow-sm transition hover:scale-105 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50";
const titleBadgeBaseClass =
  "inline-flex items-center gap-3 rounded-xl border px-4 py-2.5 shadow-sm";
const titleBadgeClass = `${titleBadgeBaseClass} border-indigo-200 bg-indigo-50/80`;
const titleDateBadgeClass = `${titleBadgeBaseClass} border-violet-200 bg-violet-50/90`;
const reportColumnCount = 7;
const titleBadgeIconBaseClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white";
const titleBadgeTextClass = "text-[1.375rem] font-bold tracking-tight text-indigo-900";
const checkboxClass =
  "h-6 w-6 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500";

function CaseIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"
      />
    </svg>
  );
}

function getLocationBadgeStyles(platform: string): {
  badge: string;
  icon: string;
  text: string;
} {
  const value = platform.trim().toLowerCase();
  if (value === "hong kong") {
    return {
      badge: "border-emerald-200 bg-emerald-50/90",
      icon: "bg-emerald-600",
      text: "text-emerald-900",
    };
  }
  if (value === "outside hong kong") {
    return {
      badge: "border-pink-200 bg-pink-50/90",
      icon: "bg-pink-500",
      text: "text-pink-900",
    };
  }
  return {
    badge: "border-indigo-200 bg-indigo-50/80",
    icon: "bg-indigo-600",
    text: "text-indigo-900",
  };
}

function LocationIcon({ className = "h-5 w-5" }: { className?: string }) {
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

function CalendarIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

function EmailIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  );
}

function PhoneIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
      />
    </svg>
  );
}

const tableCellIconClass = "h-5 w-5 shrink-0 text-indigo-500";

function CommentIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}

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

function normalizeStatus(status: string): ScamReportStatus {
  const value = status.trim().toLowerCase();
  if (value === "approve" || value === "approved") return "Approve";
  return "Pending";
}

function getStatusSelectClass(status: ScamReportStatus): string {
  if (status === "Approve") {
    return "border-green-200 bg-green-50 text-green-700 focus:border-green-400 focus:ring-green-200";
  }
  return "border-red-200 bg-red-50 text-red-700 focus:border-red-400 focus:ring-red-200";
}

const DESCRIPTION_PREVIEW_MAX = 80;

function truncateDescription(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= DESCRIPTION_PREVIEW_MAX) return trimmed;
  return `${trimmed.slice(0, DESCRIPTION_PREVIEW_MAX).trimEnd()}…`;
}

function isLongDescription(text: string): boolean {
  return text.trim().length > DESCRIPTION_PREVIEW_MAX;
}

export function AdminScamReportsTable({ reports }: AdminScamReportsTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [statusById, setStatusById] = useState<Record<string, ScamReportStatus>>(() =>
    Object.fromEntries(reports.map((report) => [report.id, normalizeStatus(report.status)]))
  );
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);
  const [adminCommentById, setAdminCommentById] = useState<Record<string, string>>(() =>
    Object.fromEntries(reports.map((report) => [report.id, report.adminComment ?? ""]))
  );
  const [savedCommentById, setSavedCommentById] = useState<Record<string, string>>(() =>
    Object.fromEntries(reports.map((report) => [report.id, report.adminComment ?? ""]))
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewDescription, setPreviewDescription] = useState<string | null>(null);
  const [previewContactDetail, setPreviewContactDetail] = useState<string | null>(null);
  const [editingCommentReportId, setEditingCommentReportId] = useState<string | null>(null);
  const [draftAdminComment, setDraftAdminComment] = useState("");
  const [confirmDeleteReportId, setConfirmDeleteReportId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const selectableReports = useMemo(
    () => reports.filter((report) => Boolean(report.id)),
    [reports]
  );

  const selectedReports = useMemo(
    () => selectableReports.filter((report) => selectedIds.has(report.id)),
    [selectableReports, selectedIds]
  );

  const allSelectableSelected =
    selectableReports.length > 0 &&
    selectableReports.every((report) => selectedIds.has(report.id));

  useEffect(() => {
    setStatusById(
      Object.fromEntries(reports.map((report) => [report.id, normalizeStatus(report.status)]))
    );
    setAdminCommentById(
      Object.fromEntries(reports.map((report) => [report.id, report.adminComment ?? ""]))
    );
    setSavedCommentById(
      Object.fromEntries(reports.map((report) => [report.id, report.adminComment ?? ""]))
    );
  }, [reports]);

  function openCommentModal(reportId: string) {
    setEditingCommentReportId(reportId);
    setDraftAdminComment(adminCommentById[reportId] ?? "");
    setActionError(null);
  }

  function closeCommentModal() {
    setEditingCommentReportId(null);
    setDraftAdminComment("");
  }

  function handleSaveAdminComment() {
    if (!editingCommentReportId) return;

    const reportId = editingCommentReportId;
    const nextComment = draftAdminComment;
    const savedComment = savedCommentById[reportId] ?? "";

    setSavingCommentId(reportId);
    setActionError(null);

    startTransition(async () => {
      try {
        await updateScamReportAdminCommentAction(reportId, nextComment);
        setAdminCommentById((current) => ({ ...current, [reportId]: nextComment }));
        setSavedCommentById((current) => ({ ...current, [reportId]: nextComment }));
        closeCommentModal();
        router.refresh();
      } catch (e) {
        setAdminCommentById((current) => ({ ...current, [reportId]: savedComment }));
        setActionError(e instanceof Error ? e.message : "Failed to save admin comment");
      } finally {
        setSavingCommentId(null);
      }
    });
  }

  function toggleReportSelection(reportId: string, checked: boolean) {
    if (!reportId) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(reportId);
      else next.delete(reportId);
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedIds(new Set(selectableReports.map((report) => report.id)));
      return;
    }
    setSelectedIds(new Set());
  }

  function handleStatusChange(reportId: string, nextStatus: ScamReportStatus) {
    const previousStatus = statusById[reportId] ?? "Pending";
    setStatusById((current) => ({ ...current, [reportId]: nextStatus }));
    setUpdatingId(reportId);
    setActionError(null);

    startTransition(async () => {
      try {
        await updateScamReportStatusAction(reportId, nextStatus);
        router.refresh();
      } catch (e) {
        setStatusById((current) => ({ ...current, [reportId]: previousStatus }));
        setActionError(e instanceof Error ? e.message : "Failed to update status");
      } finally {
        setUpdatingId(null);
      }
    });
  }

  function handleStatusSelectChange(reportId: string, value: string) {
    if (value === "Delete") {
      setConfirmDeleteReportId(reportId);
      setActionError(null);
      return;
    }
    handleStatusChange(reportId, value as ScamReportStatus);
  }

  function closeDeleteConfirmDialog() {
    if (deletingId) return;
    setConfirmDeleteReportId(null);
  }

  function handleConfirmDelete() {
    if (!confirmDeleteReportId) return;

    const reportId = confirmDeleteReportId;
    setDeletingId(reportId);
    setActionError(null);

    startTransition(async () => {
      try {
        await deleteScamReportAction(reportId);
        setConfirmDeleteReportId(null);
        router.refresh();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Failed to delete scam report");
      } finally {
        setDeletingId(null);
      }
    });
  }

  return (
    <>
      {actionError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </p>
      ) : null}

      <div className="rounded-2xl border border-indigo-100 bg-white/95 p-4 shadow-lg shadow-indigo-100/40 backdrop-blur-sm sm:p-5">
      {selectedReports.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50/70 px-5 py-3 shadow-sm">
          <p className={`font-medium text-indigo-800 ${tableTextClass}`}>
            {selectedReports.length} selected
          </p>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-indigo-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table
            className={`min-w-[64rem] w-full border-collapse divide-y divide-indigo-100 text-left ${tableTextClass}`}
          >
            <thead className="bg-gradient-to-r from-indigo-600 to-violet-600">
              <tr>
                <th className={`${tableHeaderCellClass} w-16`}>
                  <span className="sr-only">Select</span>
                  <input
                    type="checkbox"
                    checked={allSelectableSelected}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                    aria-label="Select all reports"
                    className={checkboxClass}
                  />
                </th>
                <th className={tableHeaderCellClass}>ID</th>
                <th className={tableHeaderCellClass}>Username</th>
                <th className={tableHeaderCellClass}>Description</th>
                <th className={tableHeaderCellClass}>Contact Detail</th>
                <th className={tableHeaderCellClass}>Status</th>
                <th className={tableHeaderCellClass}>
                  <span className="sr-only">Admin Comment</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report, index) => {
                const images = [report.image1, report.image2, report.image3, report.image4].filter(
                  Boolean
                ) as string[];
                const status = statusById[report.id] ?? normalizeStatus(report.status);
                const isUpdating = isPending && updatingId === report.id;
                const isSavingComment = isPending && savingCommentId === report.id;
                const isSelected = Boolean(report.id && selectedIds.has(report.id));
                const rowBg = index % 2 === 1 ? "bg-indigo-50/30" : "bg-white";
                const selectedClass = isSelected
                  ? "bg-indigo-100/70 ring-1 ring-inset ring-indigo-200"
                  : "";
                const groupTopClass = "border-t-[3px] border-indigo-200";
                const groupBottomClass = "border-b-[3px] border-indigo-300/90";
                const locationStyles = report.platform
                  ? getLocationBadgeStyles(report.platform)
                  : null;

                return (
                  <Fragment key={report.id || report.username}>
                    <tr className={`${rowBg} ${selectedClass} ${groupTopClass}`}>
                      <td colSpan={reportColumnCount} className="border-b border-indigo-100 px-6 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className={titleBadgeClass}>
                              <span className={`${titleBadgeIconBaseClass} bg-indigo-600`}>
                                <CaseIcon />
                              </span>
                              <p className={titleBadgeTextClass}>
                                {report.scamType || "Unknown scam type"}
                              </p>
                            </div>
                            {report.platform && locationStyles ? (
                              <div className={`${titleBadgeBaseClass} ${locationStyles.badge}`}>
                                <span className={`${titleBadgeIconBaseClass} ${locationStyles.icon}`}>
                                  <LocationIcon />
                                </span>
                                <p className={`${titleBadgeTextClass} ${locationStyles.text}`}>
                                  {report.platform}
                                </p>
                              </div>
                            ) : null}
                          </div>
                          {report.reportDate ? (
                            <div className={`${titleDateBadgeClass} shrink-0`}>
                              <span className={`${titleBadgeIconBaseClass} bg-violet-600`}>
                                <CalendarIcon />
                              </span>
                              <p className={`${titleBadgeTextClass} text-violet-900`}>
                                {report.reportDate}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    <tr
                      className={`hover:bg-indigo-50/60 ${rowBg} ${selectedClass} ${
                        images.length === 0 ? groupBottomClass : ""
                      }`}
                    >
                      <td className={`${tableBodyCellClass} w-16 align-middle text-slate-700`}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!report.id}
                          onChange={(e) => toggleReportSelection(report.id, e.target.checked)}
                          aria-label={`Select report ${report.id || report.username || "unknown"}`}
                          className={`${checkboxClass} align-middle`}
                        />
                      </td>
                      <td className={`${tableBodyCellClass} text-slate-900`}>{report.id || "—"}</td>
                      <td className={`${tableBodyCellClass} text-slate-700`}>
                        {report.username ? (
                          <span className="flex items-center gap-2">
                            <EmailIcon className={tableCellIconClass} />
                            {report.username}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={`max-w-[22.5rem] ${tableBodyCellClass} text-slate-700`}>
                        {report.description ? (
                          <button
                            type="button"
                            onClick={() => setPreviewDescription(report.description)}
                            className={`w-full text-left ${
                              isLongDescription(report.description)
                                ? "cursor-pointer text-indigo-700 hover:underline"
                                : "cursor-pointer hover:text-indigo-700"
                            }`}
                            aria-label="View full description"
                          >
                            <span className="line-clamp-2">
                              {truncateDescription(report.description)}
                            </span>
                          </button>
                        ) : (
                          <span>—</span>
                        )}
                      </td>
                      <td className={`max-w-[22.5rem] ${tableBodyCellClass} text-slate-700`}>
                        {report.contactDetail ? (
                          <button
                            type="button"
                            onClick={() => setPreviewContactDetail(report.contactDetail)}
                            className={`flex w-full items-start gap-2 text-left ${
                              isLongDescription(report.contactDetail)
                                ? "cursor-pointer text-indigo-700 hover:underline"
                                : "cursor-pointer hover:text-indigo-700"
                            }`}
                            aria-label="View full contact detail"
                          >
                            <PhoneIcon className={`${tableCellIconClass} mt-0.5`} />
                            <span className="line-clamp-2">
                              {truncateDescription(report.contactDetail)}
                            </span>
                          </button>
                        ) : (
                          <span>—</span>
                        )}
                      </td>
                      <td className={tableBodyCellClass}>
                        <select
                          value={status}
                          disabled={isUpdating || deletingId === report.id || !report.id}
                          onChange={(e) => handleStatusSelectChange(report.id, e.target.value)}
                          aria-label={`Status for report ${report.id}`}
                          className={`${tableControlClass} font-semibold ${getStatusSelectClass(status)}`}
                        >
                          <option value="Pending">Pending</option>
                          <option value="Approve">Approve</option>
                          <option value="Delete">Delete</option>
                        </select>
                      </td>
                      <td className={tableBodyCellClass}>
                        <button
                          type="button"
                          onClick={() => openCommentModal(report.id)}
                          disabled={isSavingComment || !report.id}
                          aria-label={`Add admin comment for report ${report.id}`}
                          title="Add comment"
                          className={commentIconButtonClass}
                        >
                          <CommentIcon />
                        </button>
                      </td>
                    </tr>
                    {images.length > 0 ? (
                      <tr
                        className={`border-t border-indigo-200/80 ${rowBg} ${selectedClass} ${groupBottomClass}`}
                      >
                        <td className={`${tableBodyCellClass} w-16`} aria-hidden />
                        <td colSpan={reportColumnCount - 1} className={`${tableBodyCellClass} pt-0`}>
                          <p className="mb-3 text-[1.125rem] font-semibold text-indigo-800">Images</p>
                          <div className="flex flex-wrap gap-3">
                            {images.slice(0, 4).map((src, imageIndex) => (
                              <button
                                key={imageIndex}
                                type="button"
                                onClick={() => setPreviewImage(getPhotoSrc(src))}
                                className="h-28 w-28 overflow-hidden rounded-lg border border-indigo-200 bg-slate-100 transition hover:border-indigo-400 hover:ring-2 hover:ring-indigo-200 sm:h-32 sm:w-32"
                                aria-label={`View image ${imageIndex + 1}`}
                              >
                                <img
                                  src={getPhotoSrc(src)}
                                  alt=""
                                  className="h-full w-full cursor-pointer object-cover"
                                />
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {previewImage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
          onClick={() => setPreviewImage(null)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Image preview"
            className="relative max-h-[90vh] max-w-5xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute -right-2 -top-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-700 shadow hover:bg-slate-50"
            >
              Close
            </button>
            <img
              src={previewImage}
              alt="Scam report attachment"
              className="max-h-[85vh] max-w-full rounded-lg border border-white/20 bg-white object-contain shadow-2xl"
            />
          </div>
        </div>
      ) : null}

      {editingCommentReportId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
          onClick={closeCommentModal}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-comment-title"
            className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="admin-comment-title" className="text-lg font-semibold text-slate-900">
              Admin Comment
            </h2>
            <p className="mt-1 text-sm text-slate-600">Report ID: {editingCommentReportId}</p>

            <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="admin-comment-input">
              Comment
            </label>
            <textarea
              id="admin-comment-input"
              value={draftAdminComment}
              onChange={(e) => setDraftAdminComment(e.target.value)}
              rows={5}
              placeholder="Enter admin comment"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCommentModal}
                disabled={isPending && savingCommentId === editingCommentReportId}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAdminComment}
                disabled={isPending && savingCommentId === editingCommentReportId}
                className="rounded-lg border border-indigo-200 bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending && savingCommentId === editingCommentReportId ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDeleteReportId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
          onClick={closeDeleteConfirmDialog}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-delete-title"
            className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-delete-title" className="text-lg font-semibold text-slate-900">
              Confirm delete
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to delete report{" "}
              <span className="font-medium text-slate-900">{confirmDeleteReportId}</span>? This
              cannot be undone.
            </p>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteConfirmDialog}
                disabled={isPending && deletingId === confirmDeleteReportId}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                No
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isPending && deletingId === confirmDeleteReportId}
                className="rounded-lg border border-red-200 bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending && deletingId === confirmDeleteReportId ? "Deleting..." : "Yes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {previewDescription ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
          onClick={() => setPreviewDescription(null)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Description preview"
            className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-900">Description</h2>
              <button
                type="button"
                onClick={() => setPreviewDescription(null)}
                className="rounded-lg border border-slate-200 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <p className="mt-4 max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {previewDescription}
            </p>
          </div>
        </div>
      ) : null}

      {previewContactDetail ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
          onClick={() => setPreviewContactDetail(null)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Contact detail preview"
            className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-900">Contact Detail</h2>
              <button
                type="button"
                onClick={() => setPreviewContactDetail(null)}
                className="rounded-lg border border-slate-200 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <p className="mt-4 max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {previewContactDetail}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
