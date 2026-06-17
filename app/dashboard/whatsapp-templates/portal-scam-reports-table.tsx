"use client";

import { isScamReportApproved } from "@/lib/nocodb-scam-report";
import { useEffect, useMemo, useState } from "react";

export interface PortalScamReportItem {
  id: unknown;
  templateName: string;
  messageBody: string;
  scamMessageText?: string;
  reportDate?: string;
  region?: string;
  contactDetail?: string;
  adminComment?: string;
  status?: string;
  category?: string;
  isOwned?: boolean;
  canEdit?: boolean;
  image1?: string;
  image2?: string;
  image3?: string;
  image4?: string;
}

interface PortalScamReportsTableProps {
  title: string;
  subtitle?: string;
  emptyMessage: string;
  reports: PortalScamReportItem[];
  loading?: boolean;
  deletingId: string | number | null;
  onEdit: (report: PortalScamReportItem) => void;
  onDelete: (report: PortalScamReportItem) => void;
  onOpenAdminComment: (report: PortalScamReportItem) => void;
  isAdminCommentRead: (reportId: unknown, comment: string) => boolean;
}

const sectionShellClass =
  "rounded-xl border border-slate-200/50 bg-white/25 p-3 shadow-lg shadow-slate-900/5 backdrop-blur-md sm:p-4";
const tableTextClass = "text-base leading-snug sm:text-lg";
const cardGridClass = "grid items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
const cardShellClass =
  "flex h-full flex-col overflow-hidden rounded-xl border border-slate-200/70 bg-white/80 shadow-lg shadow-slate-900/10 backdrop-blur-sm transition hover:-translate-y-0.5 hover:shadow-xl";
const cardHeaderClass =
  "relative flex h-[6.25rem] shrink-0 flex-col justify-end px-3 pb-8 pt-2 text-center text-white sm:h-[6.5rem]";
const cardBodyClass =
  "relative z-10 -mt-3 flex flex-1 flex-col rounded-t-2xl bg-white px-3 pb-3 pt-3.5";
const cardImagesSectionClass = "mt-2.5 min-h-[4.25rem] sm:min-h-[4.75rem]";
const cardActionsClass = "mt-auto flex flex-wrap items-center justify-center gap-1.5 pt-3";
const cardActionClass =
  "inline-flex items-center justify-center text-center rounded-md px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wide outline-none transition disabled:cursor-not-allowed disabled:opacity-60";
const DESCRIPTION_PREVIEW_MAX = 50;
const REPORTS_PER_PAGE = 12;

const paginationButtonClass =
  "rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

const APPROVED_CARD_THEME = {
  header: "bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-600",
  title: "text-emerald-600",
  tag: "border-emerald-200 bg-emerald-50 text-emerald-800",
  status: "border-emerald-200 bg-emerald-50 text-emerald-800",
  cta: "bg-amber-400 hover:bg-amber-500 text-slate-900",
} as const;

const PENDING_CARD_THEME = {
  header: "bg-gradient-to-br from-pink-500 via-pink-500 to-rose-500",
  title: "text-pink-600",
  tag: "border-pink-200 bg-pink-50 text-pink-800",
  status: "border-pink-200 bg-pink-50 text-pink-800",
  cta: "bg-amber-400 hover:bg-amber-500 text-slate-900",
} as const;

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
    badge: "border-emerald-200 bg-emerald-50/80",
    icon: "bg-emerald-600",
    text: "text-emerald-900",
  };
}

function truncateDescription(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= DESCRIPTION_PREVIEW_MAX) return trimmed;
  return `${trimmed.slice(0, DESCRIPTION_PREVIEW_MAX).trimEnd()}…`;
}

function CaseIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
    </svg>
  );
}

function LocationIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function CalendarIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function PhoneIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  );
}

function MailIcon({ className = "h-4 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function OpenMailIcon({ className = "h-4 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M21.5 2h-19A1.5 1.5 0 001 3.5v17A1.5 1.5 0 002.5 22h19a1.5 1.5 0 001.5-1.5v-17A1.5 1.5 0 0021.5 2z" />
      <polyline points="1 3.5 12 14 23 3.5" />
    </svg>
  );
}

const mailActionClass = "min-w-[3.75rem] px-3";

function ReportsPagination({
  page,
  totalPages,
  totalCount,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const start = (page - 1) * REPORTS_PER_PAGE + 1;
  const end = Math.min(page * REPORTS_PER_PAGE, totalCount);

  return (
    <nav
      className="mt-4 flex flex-wrap items-center justify-center gap-3 border-t border-slate-200/60 pt-4"
      aria-label="Reports pagination"
    >
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className={paginationButtonClass}
      >
        Previous
      </button>
      <span className="text-xs font-medium text-slate-600 sm:text-sm">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className={paginationButtonClass}
      >
        Next
      </button>
      <p className="w-full text-center text-xs text-slate-500">
        Showing {start}–{end} of {totalCount} reports
      </p>
    </nav>
  );
}

interface ReportPreview {
  scamMessageText?: string;
  description?: string;
}

function hasViewReportContent(report: PortalScamReportItem): boolean {
  return Boolean(report.scamMessageText?.trim() || report.messageBody?.trim());
}

function getReportPreview(report: PortalScamReportItem): ReportPreview {
  const scamMessageText = report.scamMessageText?.trim();
  const description = report.messageBody?.trim();
  return {
    ...(scamMessageText ? { scamMessageText } : {}),
    ...(description ? { description } : {}),
  };
}

export function PortalScamReportsTable({
  title,
  subtitle,
  emptyMessage,
  reports,
  loading = false,
  deletingId,
  onEdit,
  onDelete,
  onOpenAdminComment,
  isAdminCommentRead,
}: PortalScamReportsTableProps) {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewReport, setPreviewReport] = useState<ReportPreview | null>(null);
  const [previewContactDetail, setPreviewContactDetail] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(reports.length / REPORTS_PER_PAGE));
  const paginatedReports = useMemo(() => {
    const start = (page - 1) * REPORTS_PER_PAGE;
    return reports.slice(start, start + REPORTS_PER_PAGE);
  }, [reports, page]);

  useEffect(() => {
    setPage(1);
  }, [reports.length, title]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  if (loading) {
    return (
      <div className={`${sectionShellClass} p-8 text-center`}>
        <h2 className={`font-bold text-slate-900 ${tableTextClass}`}>{title}</h2>
        {subtitle ? <p className="mt-1 text-[1.05rem] text-slate-600">{subtitle}</p> : null}
        <p className={`mt-3 text-slate-600 ${tableTextClass}`}>Loading cases…</p>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className={`${sectionShellClass} p-8 text-center`}>
        <h2 className={`font-bold text-slate-900 ${tableTextClass}`}>{title}</h2>
        {subtitle ? <p className="mt-1 text-[1.05rem] text-slate-600">{subtitle}</p> : null}
        <p className={`mt-3 text-slate-600 ${tableTextClass}`}>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      <div className={sectionShellClass}>
        <div className="mb-3 text-center">
          <h2 className={`font-bold uppercase tracking-wide text-slate-900 ${tableTextClass}`}>
            {title}
          </h2>
          {subtitle ? (
            <p className="mx-auto mt-1 max-w-2xl text-xs leading-snug text-slate-600 sm:text-sm">
              {subtitle}
            </p>
          ) : null}
        </div>

        <div className={cardGridClass}>
          {paginatedReports.map((report, index) => {
            const reportNumber = (page - 1) * REPORTS_PER_PAGE + index + 1;
            const images = [report.image1, report.image2, report.image3, report.image4].filter(
              Boolean
            ) as string[];
            const isDeleting = deletingId === report.id;
            const hasAdminComment = Boolean(report.adminComment?.trim());
            const isCommentRead =
              hasAdminComment && isAdminCommentRead(report.id, report.adminComment ?? "");
            const location = report.region?.trim() ?? "";
            const locationStyles = location ? getLocationBadgeStyles(location) : null;
            const formattedDate = formatReportDate(report.reportDate);
            const isApproved = isScamReportApproved(report.status ?? "");
            const theme = isApproved ? APPROVED_CARD_THEME : PENDING_CARD_THEME;
            const canModify = report.canEdit && !isApproved;
            const showAdminComment = hasAdminComment && !isApproved;

            return (
              <article key={String(report.id ?? index)} className={cardShellClass}>
                <div className={`${cardHeaderClass} ${theme.header}`}>
                  <div className="relative z-10 mx-auto w-full max-w-full px-0.5">
                    <p className="text-[0.5rem] font-semibold uppercase tracking-[0.18em] text-white/75 sm:text-[0.55rem]">
                      Report #{reportNumber}
                    </p>
                    <h3 className="mt-0.5 line-clamp-2 w-full text-xs font-bold uppercase leading-snug tracking-wide sm:text-sm">
                      {report.templateName || "Unknown scam type"}
                    </h3>
                  </div>
                  <CardHeaderWave />
                </div>

                <div className={cardBodyClass}>
                  <div className="flex-1">
                  <div className="mb-2 flex flex-wrap items-center justify-center gap-1">
                    {location && locationStyles ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[0.6rem] font-semibold sm:text-[0.65rem] ${locationStyles.badge} ${locationStyles.text}`}
                      >
                        <LocationIcon className="h-3 w-3" />
                        {location}
                      </span>
                    ) : null}
                    {formattedDate ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[0.6rem] font-semibold sm:text-[0.65rem] ${theme.tag}`}
                      >
                        <CalendarIcon className="h-3 w-3" />
                        {formattedDate}
                      </span>
                    ) : null}
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[0.6rem] font-semibold sm:text-[0.65rem] ${theme.status}`}
                    >
                      <CaseIcon className="h-3 w-3" />
                      {isApproved ? "Approved" : report.status?.trim() || "Pending"}
                    </span>
                  </div>

                  <div className={cardImagesSectionClass}>
                    {images.length > 0 ? (
                      <>
                        <p className={`mb-1.5 text-left text-[0.6rem] font-bold uppercase tracking-wider sm:text-[0.65rem] ${theme.title}`}>
                          Images
                        </p>
                        <div className="flex flex-wrap justify-start gap-1.5">
                          {images.slice(0, 4).map((src, imageIndex) => (
                            <button
                              key={imageIndex}
                              type="button"
                              onClick={() => setPreviewImage(getPhotoSrc(src))}
                              className="h-12 w-12 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm transition hover:ring-2 hover:ring-amber-300 sm:h-14 sm:w-14"
                              aria-label={`View image ${imageIndex + 1}`}
                            >
                              <img
                                src={getPhotoSrc(src)}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            </button>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>

                  <div className="mt-2 text-left">
                    <div>
                      <p className={`text-[0.6rem] font-bold uppercase tracking-wider sm:text-[0.65rem] ${theme.title}`}>
                        Contact Detail
                      </p>
                      {report.contactDetail ? (
                        <button
                          type="button"
                          onClick={() => setPreviewContactDetail(report.contactDetail ?? "")}
                          className="mt-1 inline-flex w-full items-start justify-start gap-1 text-left text-[0.7rem] text-slate-700 hover:text-slate-900 sm:text-xs"
                          aria-label="View full contact detail"
                        >
                          <PhoneIcon className="mt-0.5 h-3 w-3 shrink-0" />
                          <span className="line-clamp-1">{truncateDescription(report.contactDetail)}</span>
                        </button>
                      ) : (
                        <p className="mt-1 text-xs text-slate-400">—</p>
                      )}
                    </div>
                  </div>
                  </div>

                  <div className={cardActionsClass}>
                    {showAdminComment ? (
                      <button
                        type="button"
                        onClick={() => onOpenAdminComment(report)}
                        aria-label={
                          isCommentRead
                            ? `Admin comment (read): ${report.adminComment}`
                            : `Admin comment (unread): ${report.adminComment}`
                        }
                        title="View admin message"
                        className={`${cardActionClass} ${mailActionClass} ${
                          isCommentRead
                            ? "border border-red-300 bg-red-100 text-red-700 hover:bg-red-200"
                            : "border-2 border-red-600 bg-red-600 text-white hover:border-red-700 hover:bg-red-700"
                        }`}
                      >
                        {isCommentRead ? <OpenMailIcon /> : <MailIcon />}
                      </button>
                    ) : null}
                    {canModify ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onEdit(report)}
                          disabled={isDeleting}
                          className={`${cardActionClass} ${theme.cta}`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(report)}
                          disabled={isDeleting}
                          className={`${cardActionClass} border border-red-200 bg-white text-red-600 hover:bg-red-50`}
                        >
                          {isDeleting ? "Deleting…" : "Delete"}
                        </button>
                      </>
                    ) : hasViewReportContent(report) ? (
                      <button
                        type="button"
                        onClick={() => setPreviewReport(getReportPreview(report))}
                        className={`w-full ${cardActionClass} ${theme.cta}`}
                      >
                        View report
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <ReportsPagination
          page={page}
          totalPages={totalPages}
          totalCount={reports.length}
          onPageChange={setPage}
        />
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
            onClick={(event) => event.stopPropagation()}
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

      {previewReport ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
          onClick={() => setPreviewReport(null)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-preview-title"
            className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="report-preview-title" className="text-lg font-semibold text-slate-900">
              Report details
            </h2>
            {previewReport.scamMessageText ? (
              <section className="mt-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Scam Message
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {previewReport.scamMessageText}
                </p>
              </section>
            ) : null}
            {previewReport.description ? (
              <section className={previewReport.scamMessageText ? "mt-5 border-t border-slate-100 pt-5" : "mt-4"}>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Description
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {previewReport.description}
                </p>
              </section>
            ) : null}
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewReport(null)}
                className="rounded-lg border border-emerald-200 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
              >
                Close
              </button>
            </div>
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
            aria-labelledby="contact-preview-title"
            className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="contact-preview-title" className="text-lg font-semibold text-slate-900">
              Contact Detail
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {previewContactDetail}
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewContactDetail(null)}
                className="rounded-lg border border-emerald-200 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
