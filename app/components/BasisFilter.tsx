"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";

export type Basis = "order" | "contract";

const TABS: { value: Basis; label: string; hint: string }[] = [
  { value: "order", label: "주문확정 기준", hint: "order_confirmed_at" },
  { value: "contract", label: "계약완료 기준", hint: "contract_date" },
];

/** 집계 기준 토글 — 아래 모든 섹션이 이 하나를 따른다. 섹션마다 기준이 바뀌면 숫자 하나가 두 값으로 읽힌다. */
export default function BasisFilter({ current }: { current: Basis }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function href(basis: Basis) {
    const params = new URLSearchParams(searchParams.toString());
    if (basis === "order") params.delete("basis");
    else params.set("basis", basis);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <div className="flex gap-1 p-1 bg-[#f3f5f9] rounded-lg">
      {TABS.map(({ value, label, hint }) => (
        <Link
          key={value}
          href={href(value)}
          title={hint}
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
