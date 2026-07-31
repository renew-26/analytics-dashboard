"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
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

  const [openIndex, setOpenIndex] = useState<number | null>(
    activeGroupIndex !== -1 ? activeGroupIndex : null,
  );

  useEffect(() => {
    if (activeGroupIndex !== -1) {
      setOpenIndex(activeGroupIndex);
    }
  }, [activeGroupIndex]);

  const toggle = (index: number) => {
    setOpenIndex((prev) =>
      prev === index && activeGroupIndex !== index ? null : index,
    );
  };

  return (
    <aside className="w-56 h-full bg-white border-r border-[#e2e6ec] flex flex-col flex-shrink-0">
      {/* 로고 / 홈 버튼 */}
      <div className="px-5 py-4">
        <Link
          href="/"
          className="flex items-baseline gap-1 hover:opacity-70 transition"
        >
          <span
            className="text-lg font-bold"
            style={{ color: "var(--color-primary)" }}
          >
            렌트리
          </span>
          <span className="text-xs text-[#a1a5ac]">애널리틱스</span>
        </Link>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
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
          href="/category-trends"
          label="카테고리 트렌드"
          active={pathname === "/category-trends"}
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
          href="/competitive-subsidy"
          label="경쟁사 지원금 조사"
          active={pathname === "/competitive-subsidy"}
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
              backgroundColor: "var(--color-tint-sky)",
              color: "var(--color-ink)",
            }
          : {}
      }
    >
      {label}
    </Link>
  );
}
