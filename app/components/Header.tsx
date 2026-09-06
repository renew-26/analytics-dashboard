"use client";

import { usePathname } from "next/navigation";
import { COMPANY_MAP } from "@/lib/company-map";

export default function Header({
  lastUpdated,
  basis,
}: {
  lastUpdated?: string | null;
  /** 홈 전용 기준 구간 표기 — 서버에서 계산해 넘긴다 */
  basis?: {
    month: number;
    prevMonth: number;
    range: string;
    prevRange: string;
  } | null;
}) {
  const rawPathname = usePathname();
  const pathname = decodeURIComponent(rawPathname);

  let group: string | null = null;
  let title = "이달의 요약";

  if (pathname === "/weekly-products") {
    title = "렌탈사별 상품 현황";
  } else if (pathname === "/margin-analysis") {
    title = "타사 비교";
  } else if (pathname === "/products") {
    title = "상품 관리";
  } else if (pathname === "/survey-selection/appliance") {
    title = "조사 상품 선정 - 가전";
  } else if (pathname === "/survey-selection/tps") {
    title = "조사 상품 선정 - TPS";
  } else if (pathname === "/companies") {
    title = "렌탈사 요약";
  } else if (pathname === "/categories") {
    title = "전체 카테고리";
  } else if (pathname.startsWith("/categories/")) {
    // /categories/{카테고리}[/{렌탈사}[/{상품}]] — 마지막 depth를 제목으로 세운다
    const [, , cat, co, prod] = pathname.split("/");
    group = "카테고리";
    title = prod ?? (co ? `${cat} × ${co}` : (cat ?? "카테고리"));
  } else if (pathname.startsWith("/company/")) {
    title = pathname.replace("/company/", "");
    group = COMPANY_MAP.find((c) => c.label === title)?.group ?? null;
  }

  const isHome = pathname === "/";
  // 새 IA 화면(전체 렌탈사·카테고리·카테고리×렌탈사)은 홈과 같은 기준 구간을
  // 쓰므로 기준 배지도 홈처럼 헤더에 통합한다 — 본문에서 다시 그리지 않는다.
  const showBasis =
    isHome || pathname === "/companies" || pathname.startsWith("/categories");

  return (
    <header className="px-12 py-4 border-b border-[var(--color-gray-200)] bg-white flex-shrink-0 flex items-center gap-4 flex-wrap">
      <h1 className="text-xl font-bold text-[var(--color-gray-900)]">
        {group && (
          <span className="font-normal text-[var(--color-gray-400)]">
            {group} /{" "}
          </span>
        )}
        {isHome && basis ? `${basis.month}월 요약` : title}
      </h1>

      <div className="flex-1" />

      {/* 이 화면의 모든 수치가 어느 구간인지 상시 표기한다 — 우측 고정 */}
      {showBasis && basis && (
        <div className="flex items-center gap-[7px] rounded-full border border-[var(--color-gray-200)] bg-[var(--color-gray-100)] px-[11px] py-1 text-[12px] text-[var(--color-gray-600)]">
          <span>기준</span>
          <b className="num font-mono font-semibold tracking-[-.2px] text-[var(--color-gray-900)]">
            {basis.range}
          </b>
          <span className="text-[var(--color-gray-400)]">
            {basis.month}월 누계 · {basis.prevMonth}월 동기간(
            {basis.prevRange}) 대비
          </span>
        </div>
      )}

      {lastUpdated && (
        <span className="text-xs text-[var(--color-gray-400)]">
          업데이트 {lastUpdated}
        </span>
      )}
    </header>
  );
}
