"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export default function ViewToggle({
  current,
}: {
  current: "order" | "contract";
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function href(tab: "order" | "contract") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    return `${pathname}?${params.toString()}`;
  }

  return (
    <div className="flex gap-1 p-1 bg-[#f3f5f9] rounded-lg">
      <Link
        href={href("order")}
        className={`press px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${
          current === "order"
            ? "bg-white shadow-sm text-[#222222]"
            : "text-[#788093] hover:text-[#393939]"
        }`}
      >
        주문확정
      </Link>
      <Link
        href={href("contract")}
        className={`press px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${
          current === "contract"
            ? "bg-white shadow-sm text-[#222222]"
            : "text-[#788093] hover:text-[#393939]"
        }`}
      >
        계약완료
      </Link>
    </div>
  );
}
