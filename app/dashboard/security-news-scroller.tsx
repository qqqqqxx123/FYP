"use client";

import type { SecurityNewsItem } from "@/lib/security-news-rss";
import { formatSecurityNewsDate } from "@/lib/security-news-rss";
import { useEffect, useRef } from "react";

interface SecurityNewsScrollerProps {
  items: SecurityNewsItem[];
}

function SecurityNewsRow({ item }: { item: SecurityNewsItem }) {
  return (
    <div className="grid grid-cols-[4.5rem_5.5rem_6.5rem_minmax(0,1fr)] items-center gap-2 border-b border-slate-100 px-4 py-1.5 text-[0.7rem] leading-tight sm:px-5 sm:text-xs">
      <span className="whitespace-nowrap text-slate-500">
        {formatSecurityNewsDate(item.pubDate)}
      </span>
      <span className="truncate font-medium text-slate-700">{item.source}</span>
      <span className="truncate text-slate-500">{item.category}</span>
      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="truncate font-medium text-orange-700 underline-offset-2 hover:underline"
        title={item.title}
      >
        {item.title}
      </a>
    </div>
  );
}

export function SecurityNewsScroller({ items }: SecurityNewsScrollerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isHoveredRef = useRef(false);

  const loopItems = [...items, ...items];

  useEffect(() => {
    const container = containerRef.current;
    if (!container || items.length === 0) return;

    const tick = window.setInterval(() => {
      if (isHoveredRef.current) return;

      const loopHeight = container.scrollHeight / 2;
      if (loopHeight <= container.clientHeight) return;

      container.scrollTop += 1;
      if (container.scrollTop >= loopHeight) {
        container.scrollTop = 0;
      }
    }, 80);

    return () => window.clearInterval(tick);
  }, [items]);

  return (
    <section
      className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-lg shadow-slate-900/5"
      onMouseEnter={() => {
        isHoveredRef.current = true;
      }}
      onMouseLeave={() => {
        isHoveredRef.current = false;
      }}
      aria-label="Security news"
    >
      <div className="grid grid-cols-[4.5rem_5.5rem_6.5rem_minmax(0,1fr)] gap-2 border-b border-slate-100 bg-slate-50 px-4 py-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500 sm:px-5 sm:text-[0.7rem]">
        <span>Date</span>
        <span>Source</span>
        <span>Type</span>
        <span>Title</span>
      </div>
      <div
        ref={containerRef}
        className="h-32 overflow-y-auto overscroll-contain sm:h-36 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent]"
      >
        {loopItems.map((item, index) => (
          <SecurityNewsRow key={`${item.id}-${index}`} item={item} />
        ))}
      </div>
    </section>
  );
}
