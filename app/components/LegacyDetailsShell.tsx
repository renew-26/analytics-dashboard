import Link from "next/link";
import type { ReactNode } from "react";

/**
 * 접힌 "상세 데이터" 섹션의 틀. 예전엔 이 섹션이 <details>로 화면에 항상
 * 마운트돼 있었다 — 접혀서 안 보여도 24개월 집계 쿼리가 같은 요청 안에서
 * 끝나야 페이지가 완성됐다(필터 전환이 느렸던 원인). 이제 열림 여부는
 * URL(?details=1)이 정하고, 접혀 있을 때는 이 컴포넌트가 열기 링크만 그린다
 * — children(무거운 서버 컴포넌트)은 페이지가 open===true일 때만 넘기므로
 * 접힌 상태에서는 그 쿼리 자체가 생기지 않는다.
 *
 * 일단 열리면 실제 <details open>으로 그린다 — 이후의 접기/펼치기는 다시
 * 요청을 만들지 않고 브라우저 기본 동작으로 처리된다.
 */
export default function LegacyDetailsShell({
  open,
  label,
  openHref,
  children,
}: {
  open: boolean;
  label: string;
  openHref: string;
  children: ReactNode;
}) {
  if (!open) {
    return (
      <Link
        href={openHref}
        className="text-sm font-semibold text-[var(--color-gray-700)] flex items-center gap-2 select-none hover:text-[var(--color-primary)] transition-colors w-fit"
      >
        <span className="text-[var(--color-gray-400)] inline-block">▶</span>
        {label}
      </Link>
    );
  }

  return (
    <details open className="group">
      <summary className="text-sm font-semibold text-[var(--color-gray-700)] cursor-pointer list-none flex items-center gap-2 select-none">
        <span className="text-[var(--color-gray-400)] group-open:rotate-90 transition-transform inline-block">▶</span>
        {label}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
