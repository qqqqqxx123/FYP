import { fetchSecurityNewsItems } from "@/lib/security-news-rss";
import { SecurityNewsScroller } from "./security-news-scroller";

export async function SecurityNewsSection() {
  const items = await fetchSecurityNewsItems();

  return (
    <div className="w-full space-y-6">
      <h2 className="text-center text-lg font-semibold uppercase tracking-[0.2em] text-amber-900/80">
        Security news
      </h2>
      {items.length === 0 ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white px-4 py-6 shadow-lg shadow-slate-900/5 sm:px-5">
          <p className="text-center text-xs text-slate-500">
            Security news is temporarily unavailable. Please try again later.
          </p>
        </section>
      ) : (
        <SecurityNewsScroller items={items} />
      )}
    </div>
  );
}
