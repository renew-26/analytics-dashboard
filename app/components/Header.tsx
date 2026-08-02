"use client";

import { usePathname } from "next/navigation";
import { COMPANY_MAP } from "@/lib/company-map";

export default function Header({ lastUpdated }: { lastUpdated?: string | null }) {
  const rawPathname = usePathname();
  const pathname = decodeURIComponent(rawPathname);

  let group: string | null = null;
  let title = "렌트리 애널리틱스";

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
  } else if (pathname.startsWith("/company/")) {
    title = pathname.replace("/company/", "");
    group = COMPANY_MAP.find((c) => c.label === title)?.group ?? null;
  }

  return (
    <header className="px-12 py-4 border-b border-[#e2e6ec] bg-white flex-shrink-0 flex items-center justify-between">
      <h1 className="text-xl font-bold text-[#222222]">
        {group && <span className="font-normal text-[#a1a5ac]">{group} / </span>}
        {title}
      </h1>
      {lastUpdated && (
        <span className="text-xs text-[#a1a5ac]">
          업데이트 {lastUpdated}
        </span>
      )}
    </header>
  );
}
