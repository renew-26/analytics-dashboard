import Link from "next/link";

export type Crumb = { label: string; href?: string };

/**
 * 상세 페이지 공통 breadcrumb — `홈 › 정수기 › 코웨이 › 상품`.
 * 마지막 항목은 현재 위치라 링크를 걸지 않는다. "지금 분석 경로의 어디에
 * 서 있나"를 항상 보여주는 것이 목적이므로 모든 depth 페이지 최상단에 둔다.
 */
export default function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav
      aria-label="현재 위치"
      className="flex flex-wrap items-center gap-[6px] text-[12px] text-[var(--color-gray-500)]"
    >
      <Link href="/" className="hover:text-[var(--color-primary)]">
        홈
      </Link>
      {items.map((c, i) => (
        <span key={`${c.label}-${i}`} className="flex items-center gap-[6px]">
          <span className="text-[var(--color-gray-250)]">›</span>
          {c.href ? (
            <Link href={c.href} className="hover:text-[var(--color-primary)]">
              {c.label}
            </Link>
          ) : (
            <b className="max-w-[300px] truncate font-bold text-[var(--color-gray-900)]">
              {c.label}
            </b>
          )}
        </span>
      ))}
    </nav>
  );
}
