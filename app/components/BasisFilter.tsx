"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { MouseEvent } from "react";
import { usePendingNav, useOptimisticActive } from "./PendingNav";

export type Basis = "order" | "contract";

const TABS: { value: Basis; label: string; hint: string }[] = [
  { value: "order", label: "주문확정 기준", hint: "order_confirmed_at" },
  { value: "contract", label: "계약완료 기준", hint: "contract_date" },
];

/** 집계 기준 토글 — 아래 모든 섹션이 이 하나를 따른다. 섹션마다 기준이 바뀌면 숫자 하나가 두 값으로 읽힌다. */
export default function BasisFilter({ current }: { current: Basis }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { navigate } = usePendingNav();
  const { active, setOptimistic } = useOptimisticActive(current);

  function href(basis: Basis) {
    const params = new URLSearchParams(searchParams.toString());
    if (basis === "order") params.delete("basis");
    else params.set("basis", basis);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  // 실제 <a>는 그대로 둔다 — 가운데 클릭·Ctrl/Cmd·Shift 클릭·우클릭은 브라우저
  // 기본 동작(새 탭, 링크 복사)을 그대로 타야 하므로 일반 좌클릭만 가로챈다.
  function handleClick(e: MouseEvent<HTMLAnchorElement>, value: Basis, target: string) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    setOptimistic(value);
    navigate(target);
  }

  return (
    <div className="flex gap-1 p-1 bg-[#f3f5f9] rounded-lg">
      {TABS.map(({ value, label, hint }) => {
        const target = href(value);
        return (
          <Link
            key={value}
            href={target}
            title={hint}
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
