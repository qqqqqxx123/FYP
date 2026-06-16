"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface IncidentDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  maxDate?: string;
}

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"] as const;

function parseIsoDate(iso: string): Date | null {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(iso: string): string {
  const date = parseIsoDate(iso);
  if (!date) return "Select date of incident";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function CalendarIcon({ className }: { className?: string }) {
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

export function IncidentDatePicker({
  value,
  onChange,
  maxDate,
}: IncidentDatePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  const maxDateValue = useMemo(
    () => (maxDate ? parseIsoDate(maxDate) : today),
    [maxDate, today]
  );

  const [viewMonth, setViewMonth] = useState(() => {
    const selected = parseIsoDate(value);
    return startOfMonth(selected ?? today);
  });

  useEffect(() => {
    const selected = parseIsoDate(value);
    if (selected) setViewMonth(startOfMonth(selected));
  }, [value]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const monthLabel = `${viewMonth.getFullYear()}年 ${String(viewMonth.getMonth() + 1).padStart(2, "0")}月`;

  const calendarDays = useMemo(() => {
    const firstDay = startOfMonth(viewMonth);
    const startOffset = firstDay.getDay();
    const gridStart = new Date(firstDay);
    gridStart.setDate(firstDay.getDate() - startOffset);

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      const iso = toIsoDate(date);
      const isCurrentMonth = date.getMonth() === viewMonth.getMonth();
      const isSelected = value === iso;
      const isToday = isSameDay(date, today);
      const isDisabled = maxDateValue ? date > maxDateValue : false;

      return {
        date,
        iso,
        label: date.getDate(),
        isCurrentMonth,
        isSelected,
        isToday,
        isDisabled,
      };
    });
  }, [maxDateValue, today, value, viewMonth]);

  function selectDate(iso: string) {
    onChange(iso);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center justify-between rounded-xl border bg-white px-3 py-2.5 text-left text-sm shadow-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-300 ${
          open ? "border-emerald-400 ring-2 ring-emerald-100" : "border-slate-300 hover:border-emerald-300"
        }`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={value ? "font-medium text-slate-900" : "text-slate-500"}>
          {formatDisplayDate(value)}
        </span>
        <span className="ml-3 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          <CalendarIcon className="h-5 w-5" />
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Choose date of incident"
          className="absolute left-0 top-[calc(100%+0.5rem)] z-[70] w-[20.5rem] overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-2xl shadow-emerald-200/50"
        >
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-3 text-white">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setViewMonth((current) => addMonths(current, -1))}
                className="rounded-lg border border-white/20 px-2 py-1 text-sm transition hover:bg-white/10"
                aria-label="Previous month"
              >
                ‹
              </button>
              <p className="text-sm font-semibold tracking-wide">{monthLabel}</p>
              <button
                type="button"
                onClick={() => setViewMonth((current) => addMonths(current, 1))}
                className="rounded-lg border border-white/20 px-2 py-1 text-sm transition hover:bg-white/10"
                aria-label="Next month"
              >
                ›
              </button>
            </div>
          </div>

          <div className="p-3">
            <div className="mb-2 grid grid-cols-7 gap-1">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="py-1 text-center text-xs font-semibold uppercase tracking-wide text-emerald-500"
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day) => (
                <button
                  key={day.iso}
                  type="button"
                  disabled={day.isDisabled}
                  onClick={() => selectDate(day.iso)}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm transition ${
                    day.isSelected
                      ? "bg-emerald-600 font-semibold text-white shadow-md shadow-emerald-300/60"
                      : day.isToday
                        ? "border border-emerald-300 bg-emerald-50 font-semibold text-emerald-700"
                        : day.isCurrentMonth
                          ? "text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
                          : "text-slate-300 hover:bg-slate-50"
                  } disabled:cursor-not-allowed disabled:opacity-35`}
                >
                  {day.label}
                </button>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-emerald-100 pt-3">
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="text-sm font-medium text-slate-500 transition hover:text-emerald-600"
              >
                清除
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!maxDateValue || today <= maxDateValue) {
                    selectDate(toIsoDate(today));
                  }
                }}
                className="rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
              >
                今天
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
