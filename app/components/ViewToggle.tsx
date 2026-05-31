"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ViewToggle({
  current,
}: {
  current: "order" | "contract";
}) {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
      <Link
        href={`${pathname}?tab=order`}
        className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${
          current === "order"
            ? "bg-white shadow-sm text-gray-800"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        주문확정
      </Link>
      <Link
        href={`${pathname}?tab=contract`}
        className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${
          current === "contract"
            ? "bg-white shadow-sm text-gray-800"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        계약완료
      </Link>
    </div>
  );
}
