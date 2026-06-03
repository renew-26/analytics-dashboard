"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { COMPANY_MAP } from "@/lib/company-map";

// COMPANY_MAP에서 중복 라벨 제거 후 그룹별로 묶기
const seen = new Set<string>();
const NAV_SECTIONS = ["가전&상조", "정수기", "통신"].map((group) => ({
  group,
  items: COMPANY_MAP.filter((c) => {
    if (c.group !== group || seen.has(c.label)) return false;
    seen.add(c.label);
    return true;
  })
    .map((c) => ({ label: c.label, href: `/company/${c.label}` }))
    .sort((a, b) => a.label.localeCompare(b.label, "ko")),
}));

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
    <aside className="w-56 h-full bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
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
          <span className="text-xs text-gray-400">애널리틱스</span>
        </Link>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
        <NavItem
          href="/weekly-products"
          label="렌탈사별 상품 현황"
          active={pathname === "/weekly-products"}
        />
        <NavItem
          href="/competitive-subsidy"
          label="경쟁사 지원금 조사"
          active={pathname === "/competitive-subsidy"}
        />

        {NAV_SECTIONS.map((section, index) => {
          const hasActive = section.items.some(
            (item) => item.href === pathname,
          );
          const isOpen = openIndex === index || hasActive;

          return (
            <div key={section.group} className="mt-4">
              <button
                onClick={() => toggle(index)}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg group transition ${
                  isOpen ? "bg-gray-100" : "hover:bg-gray-100"
                }`}
              >
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wider transition ${
                    hasActive || isOpen ? "text-gray-600" : "text-gray-400"
                  } group-hover:text-gray-600`}
                >
                  {section.group}
                </span>
                <span
                  className={`text-gray-400 text-[10px] transition-transform duration-200 group-hover:text-gray-600 ${
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
      </nav>
    </aside>
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
        active ? "font-semibold" : "text-gray-600 hover:bg-gray-100"
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
