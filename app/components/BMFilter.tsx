"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { MouseEvent } from "react";
import { usePendingNav, useOptimisticActive } from "./PendingNav";

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
  const { navigate } = usePendingNav();
  const { active, setOptimistic } = useOptimisticActive(current);

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

  // 실제 <a>는 그대로 둔다 — 가운데 클릭·Ctrl/Cmd·Shift 클릭·우클릭은 브라우저
  // 기본 동작(새 탭, 링크 복사)을 그대로 타야 하므로 일반 좌클릭만 가로챈다.
  function handleClick(e: MouseEvent<HTMLAnchorElement>, value: BM, target: string) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    setOptimistic(value);
    navigate(target);
  }

  return (
    <div className="flex gap-1 p-1 bg-[#f3f5f9] rounded-lg">
      {TABS.map(({ value, label }) => {
        const target = href(value);
        return (
          <Link
            key={value}
            href={target}
            onClick={(e) => handleClick(e, value, target)}
            aria-current={active === value ? "true" : undefined}
            className={`press px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${
              active === value
                ? "bg-white shadow-sm text-[#222222]"
                : "text-[#788093] hover:text-[#393939]"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
