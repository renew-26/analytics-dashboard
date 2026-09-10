"use client";

import { usePathname } from "next/navigation";
import Breadcrumb, { type Crumb } from "@/app/components/Breadcrumb";

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

  let title = "이달의 요약";
  // 현재 위치는 h1이 맡으므로 crumbs에는 "위로 가는 길"만 담는다.
  // 비어 있으면 그리지 않는다 — 홈 하나짜리 경로는 사이드바가 이미 하는 말이라
  // 제목 위에 군더더기 한 줄만 남는다. 2depth부터 경로가 의미를 갖는다.
  let crumbs: Crumb[] = [];

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
  } else if (pathname === "/exception-approval") {
    title = "예외승인 분석";
  } else if (pathname === "/companies") {
    title = "렌탈사 요약";
  } else if (pathname === "/categories") {
    title = "전체 카테고리";
  } else if (pathname.startsWith("/categories/")) {
    // /categories/{카테고리}[/{렌탈사}[/{상품}]] — 마지막 depth를 제목으로 세우고
    // 그 위 depth는 전부 경로로 남긴다
    const [, , cat, co, prod] = pathname.split("/");
    const catHref = `/categories/${encodeURIComponent(cat ?? "")}`;
    crumbs = [{ label: "카테고리", href: "/categories" }];
    if (cat && co) crumbs.push({ label: cat, href: catHref });
    if (cat && co && prod)
      crumbs.push({
        label: co,
        href: `${catHref}/${encodeURIComponent(co)}`,
      });
    title = prod ?? (co ? `${cat} × ${co}` : (cat ?? "카테고리"));
  } else if (pathname.startsWith("/company/")) {
    title = pathname.replace("/company/", "");
    crumbs = [{ label: "렌탈사", href: "/companies" }];
  }

  const isHome = pathname === "/";
  // 새 IA 화면(전체 렌탈사·카테고리·카테고리×렌탈사)은 홈과 같은 기준 구간을
  // 쓰므로 기준 배지도 홈처럼 헤더에 통합한다 — 본문에서 다시 그리지 않는다.
  const showBasis =
    isHome || pathname === "/companies" || pathname.startsWith("/categories");

  return (
    <header className="px-12 py-4 border-b border-[var(--color-gray-200)] bg-white flex-shrink-0 flex items-center gap-4 flex-wrap">
      {/* 현재 위치(경로)는 본문이 아니라 상단바가 진다 — 본문 첫 줄은 분석으로 시작한다 */}
      <div className="min-w-0">
        {crumbs.length > 0 && (
          <div className="mb-[2px]">
            <Breadcrumb items={crumbs} />
          </div>
        )}
        <h1 className="text-xl font-bold text-[var(--color-gray-900)]">
          {isHome && basis ? `${basis.month}월 요약` : title}
        </h1>
      </div>

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
