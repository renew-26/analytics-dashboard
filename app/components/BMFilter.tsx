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
    <div className="flex gap-1 p-1 bg-[#f3f5f9] rounded-lg">
      {TABS.map(({ value, label }) => (
        <Link
          key={value}
          href={href(value)}
          className={`press px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${
            current === value
              ? "bg-white shadow-sm text-[#222222]"
              : "text-[#788093] hover:text-[#393939]"
          }`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
