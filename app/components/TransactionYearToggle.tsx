"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export default function TransactionYearToggle({ hidden }: { hidden: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function href(nextHidden: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextHidden) {
      params.set("hide2025", "1");
    } else {
      params.delete("hide2025");
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <Link
      href={href(!hidden)}
      className="ml-auto px-2.5 py-1 text-xs font-medium rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50"
    >
      {hidden ? "25년 데이터 보기" : "25년 데이터 숨기기"}
    </Link>
  );
}
