"use client";

import {
  CARD_COLOR_OPTIONS,
  CARD_COLOR_SWATCH_STYLE,
  type CardColorId,
} from "@/lib/dashboard-card-colors";
import { PaletteIcon } from "@/components/palette-icon";
import { useEffect, useRef, useState } from "react";

interface DashboardColorPickerProps {
  value: CardColorId;
  onChange: (colorId: CardColorId) => void;
  label?: string;
  labelClassName?: string;
  variant?: "light" | "dark";
  className?: string;
}

export function DashboardColorPicker({
  value,
  onChange,
  label = "Card color",
  labelClassName,
  variant = "light",
  className = "",
}: DashboardColorPickerProps) {
  const isDark = variant === "dark";
  const selectedRing = isDark
    ? "ring-2 ring-white ring-offset-1 ring-offset-transparent"
    : "ring-2 ring-slate-800 ring-offset-1";
  const unselectedRing = isDark ? "ring-1 ring-white/40" : "ring-1 ring-slate-200";
  const labelClass =
    labelClassName ??
    (isDark
      ? "text-[0.6rem] font-bold uppercase tracking-wider text-white/85"
      : "text-[0.6rem] font-bold uppercase tracking-wider text-emerald-600");

  return (
    <div className={className}>
      <p className={`${labelClass} ${isDark ? "hidden sm:block" : ""}`}>{label}</p>
      <div
        className={`flex items-center gap-1.5 ${isDark ? "" : "mt-1"}`}
        role="group"
        aria-label={label}
      >
        {CARD_COLOR_OPTIONS.map((option) => {
          const isSelected = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              aria-label={`${option.label} color`}
              aria-pressed={isSelected}
              title={option.label}
              style={{ backgroundImage: CARD_COLOR_SWATCH_STYLE[option.id] }}
              className={`h-5 w-5 rounded-full shadow-sm transition hover:scale-105 ${
                isSelected ? selectedRing : unselectedRing
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}

interface DashboardColorPickerPopoverProps {
  value: CardColorId;
  onChange: (colorId: CardColorId) => void;
  ariaLabel?: string;
  className?: string;
}

export function DashboardColorPickerPopover({
  value,
  onChange,
  ariaLabel = "Choose header color",
  className = "",
}: DashboardColorPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
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

  function handleSelect(nextColorId: CardColorId) {
    onChange(nextColorId);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={ariaLabel}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/95 shadow-sm ring-1 ring-white/60 transition hover:scale-105 hover:bg-white"
      >
        <PaletteIcon className="h-[18px] w-[18px]" />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={ariaLabel}
          className="absolute right-0 top-full z-50 mt-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-lg"
        >
          <div className="flex items-center gap-2" role="group" aria-label={ariaLabel}>
            {CARD_COLOR_OPTIONS.map((option) => {
              const isSelected = option.id === value;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleSelect(option.id)}
                  aria-label={`${option.label} color`}
                  aria-pressed={isSelected}
                  title={option.label}
                  style={{ backgroundImage: CARD_COLOR_SWATCH_STYLE[option.id] }}
                  className={`h-6 w-6 shrink-0 rounded-full shadow-sm transition hover:scale-105 ${
                    isSelected ? "ring-2 ring-slate-800 ring-offset-1" : "ring-1 ring-slate-200"
                  }`}
                />
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
