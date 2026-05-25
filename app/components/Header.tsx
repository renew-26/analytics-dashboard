"use client";

import { usePathname } from "next/navigation";
import { COMPANY_MAP } from "@/lib/company-map";

export default function Header() {
  const rawPathname = usePathname();
  const pathname = decodeURIComponent(rawPathname);

  let group: string | null = null;
  let title = "렌트리 애널리틱스";

  if (pathname.startsWith("/company/")) {
    title = pathname.replace("/company/", "");
    group = COMPANY_MAP.find((c) => c.label === title)?.group ?? null;
  }

  return (
    <header className="px-12 py-4 border-b border-gray-200 bg-white flex-shrink-0">
      <h1 className="text-xl font-bold text-gray-800">
        {group && (
          <span className="font-normal text-gray-400">{group} / </span>
        )}
        {title}
      </h1>
    </header>
  );
}
