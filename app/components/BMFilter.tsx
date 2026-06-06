"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";

type BM = "all" | "bm1" | "bm2" | "bm3";

const TABS: { value: BM; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "bm1", label: "BM1" },
  { value: "bm2", label: "BM2" },
  { value: "bm3", label: "BM3" },
];

export default function BMFilter({ current }: { current: BM }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function href(bm: BM) {
    const params = new URLSearchParams(searchParams.toString());
    if (bm === "all") {
      params.delete("bm");
    } else {
      params.set("bm", bm);
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
      {TABS.map(({ value, label }) => (
        <Link
          key={value}
          href={href(value)}
          className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${
            current === value
              ? "bg-white shadow-sm text-gray-800"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
