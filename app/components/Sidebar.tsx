"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { COMPANY_MAP } from "@/lib/company-map";

// COMPANY_MAP에서 그룹 내 중복 라벨 제거 후 그룹별로 묶기
// (seen은 그룹별로 분리 — LG 헬스케어처럼 여러 그룹에 속하는 라벨이 누락되지 않도록)
const NAV_SECTIONS = ["가전&상조", "정수기", "통신"].map((group) => {
  const seen = new Set<string>();
  return {
    group,
    items: COMPANY_MAP.filter((c) => {
      if (c.group !== group || seen.has(c.label)) return false;
      seen.add(c.label);
      return true;
    })
      .map((c) => ({ label: c.label, href: `/company/${c.label}` }))
      .sort((a, b) => a.label.localeCompare(b.label, "ko")),
  };
});

export default function Sidebar() {
  const rawPathname = usePathname();
  const pathname = decodeURIComponent(rawPathname);

  const activeGroupIndex = NAV_SECTIONS.findIndex((s) =>
    s.items.some((item) => item.href === pathname),
  );

  // 기본으로 열리는 그룹은 활성 그룹이고, 사용자가 직접 접거나 펼친 경우에만 그걸 덮는다.
  // override에 "그때의 활성 그룹"(at)을 함께 담아두면 페이지를 옮겨 activeGroupIndex가
  // 바뀐 순간 override가 스스로 무효가 된다 — 수동으로 펼친 그룹이 이동과 함께 접힌다.
  // effect로 state를 되맞추던 걸 파생값으로 바꾼 것이라 이동마다 나던 추가 렌더가 사라진다.
  const [override, setOverride] = useState<{
    at: number;
    index: number | null;
  } | null>(null);

  const openIndex =
    override && override.at === activeGroupIndex
      ? override.index
      : activeGroupIndex !== -1
        ? activeGroupIndex
        : null;

  const toggle = (index: number) => {
    // 활성 그룹은 접지 않는다 — 현재 위치를 내비에서 잃게 된다.
    const next =
      openIndex === index && activeGroupIndex !== index ? null : index;
    setOverride({ at: activeGroupIndex, index: next });
  };

  return (
    <aside className="w-56 h-full bg-white border-r border-[#e2e6ec] flex flex-col flex-shrink-0">
      {/* 로고 / 홈 버튼 */}
      <div className="px-5 py-4">
        <Link href="/" className="group flex items-baseline gap-1">
          <span className="text-lg font-bold text-[var(--color-gray-900)] transition-colors duration-[120ms] group-hover:text-[var(--color-gray-600)]">
            렌트리
          </span>
          <span className="text-xs text-[#a1a5ac]">애널리틱스</span>
        </Link>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
        {/* 매출 분석 섹션 */}
        <SectionHeader label="매출 분석" />
        <NavItem
          href="/revenue-analysis"
          label="수수료 매출"
          active={pathname === "/revenue-analysis"}
        />
        <NavItem
          href="/transaction-count"
          label="전체 거래건수"
          active={pathname === "/transaction-count"}
        />

        {/* 렌탈사별 매출 추이 섹션 */}
        <SectionHeader label="렌탈사별 매출 추이" />

        {NAV_SECTIONS.map((section, index) => {
          const hasActive = section.items.some(
            (item) => item.href === pathname,
          );
          const isOpen = openIndex === index || hasActive;

          return (
            <div key={section.group} className="mt-2">
              <button
                onClick={() => toggle(index)}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg group transition ${
                  isOpen ? "bg-[#f3f5f9]" : "hover:bg-[#f3f5f9]"
                }`}
              >
                <span
                  className={`text-sm font-medium transition ${
                    hasActive || isOpen ? "text-[#222222]" : "text-[#586177]"
                  } group-hover:text-[#222222]`}
                >
                  {section.group}
                </span>
                <span
                  className={`text-[#a1a5ac] text-xs transition-transform duration-200 group-hover:text-[#586177] ${
                    isOpen ? "rotate-180" : ""
                  }`}
                >
                  ▾
                </span>
              </button>

              {isOpen && (
                <div className="mt-1 pl-2">
                  {/* 그룹 요약 — 개별 렌탈사보다 상위 개념이라 목록 맨 위 */}
                  <NavItem
                    href={`/group/${section.group}`}
                    label="그룹 요약"
                    active={pathname === `/group/${section.group}`}
                  />
                  {section.items.map((item) => (
                    <NavItem
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      active={pathname === item.href}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* 상품 전략 섹션 */}
        <SectionHeader label="상품 전략" />
        <NavItem
          href="/operation-efficiency"
          label="운영효율뷰"
          active={pathname === "/operation-efficiency"}
        />
        <NavItem
          href="/category-trends"
          label="카테고리 트렌드"
          active={pathname === "/category-trends"}
        />
        {/* 카테고리 상세는 페이지 내 탭으로 카테고리를 바꾸므로
            사이드바에는 최대 카테고리 하나만 진입점으로 둔다 */}
        <NavItem
          href="/category/정수기"
          label="카테고리 상세"
          active={pathname.startsWith("/category/")}
        />
        <NavItem
          href="/brand-analysis"
          label="브랜드 분석"
          active={pathname === "/brand-analysis"}
        />

        {/* 수익성 분석 섹션 */}
        <SectionHeader label="수익성 분석" />
        <NavItem
          href="/exception-approval"
          label="예외승인 분석"
          active={pathname === "/exception-approval"}
        />

        {/* 렌탈사 분석 섹션 */}
        <SectionHeader label="렌탈사 분석" />
        <NavItem
          href="/compare"
          label="렌탈사 비교"
          active={pathname === "/compare"}
        />
        <NavItem
          href="/conversion"
          label="전환율 분석"
          active={pathname === "/conversion"}
        />

        {/* 시장 정보 섹션 */}
        <SectionHeader label="시장 정보" />
        <NavItem
          href="/margin-analysis"
          label="타사 비교"
          active={pathname === "/margin-analysis"}
        />
        <NavItem
          href="/products"
          label="상품 관리"
          active={pathname === "/products"}
        />
        <NavItem
          href="/product-lookup"
          label="상품 지원금 조회"
          active={pathname === "/product-lookup"}
        />
        <NavItem
          href="/survey-selection/appliance"
          label="조사 상품 선정 - 가전"
          active={pathname === "/survey-selection/appliance"}
        />
        <NavItem
          href="/survey-selection/tps"
          label="조사 상품 선정 - TPS"
          active={pathname === "/survey-selection/tps"}
        />
      </nav>
    </aside>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="px-3 py-4 text-[10px] font-semibold uppercase tracking-wider text-[#a1a5ac]">
      {label}
    </p>
  );
}

function NavItem({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-0.5 flex items-center gap-2 transition ${
        active ? "font-semibold" : "text-[#586177] hover:bg-[#f3f5f9]"
      }`}
      style={
        active
          ? {
              backgroundColor: "var(--color-gray-200)",
              color: "var(--color-ink)",
            }
          : {}
      }
    >
      {label}
    </Link>
  );
}
