import Link from "next/link";

export default function CategoryTabs({
  categories,
  current,
}: {
  categories: string[];
  current: string;
}) {
  return (
    <nav className="flex flex-wrap gap-1.5" aria-label="카테고리 선택">
      {categories.map((cat) => {
        const on = cat === current;
        return (
          <Link
            key={cat}
            href={`/category/${encodeURIComponent(cat)}`}
            aria-current={on ? "page" : undefined}
            className={
              on
                ? "rounded-[9999px] border border-[var(--color-gray-900)] bg-[var(--color-gray-900)] px-3 py-[5px] text-[12px] font-semibold text-white"
                : "rounded-[9999px] border border-[var(--color-gray-200)] bg-white px-3 py-[5px] text-[12px] font-medium text-[var(--color-gray-500)] hover:border-[var(--color-gray-400)] hover:text-[var(--color-gray-900)]"
            }
          >
            {cat}
          </Link>
        );
      })}
    </nav>
  );
}
