"use client";

import { useState, type ReactNode } from "react";

/**
 * 패널 내부 탭 — 서버에서 렌더된 콘텐츠(ReactNode)를 받아 전환만 담당한다.
 * 비활성 탭도 hidden으로 유지해 SSR 결과를 버리지 않는다 (탭 전환에 재요청 없음).
 */
export default function PanelTabs({
  tabs,
}: {
  tabs: { key: string; label: string; hint?: string; content: ReactNode }[];
}) {
  const [active, setActive] = useState(tabs[0]?.key);
  const hint = tabs.find((t) => t.key === active)?.hint;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-[6px] p-[13px_17px_11px]">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              className={`press rounded-full border px-3 py-[5px] text-[12px] font-semibold transition-colors ${
                on
                  ? "border-[var(--color-primary-200)] bg-[var(--color-primary-50)] text-[var(--color-primary-700)]"
                  : "border-[var(--color-gray-200)] bg-white text-[var(--color-gray-600)] hover:border-[var(--color-gray-400)] hover:text-[var(--color-gray-900)]"
              }`}
            >
              {t.label}
            </button>
          );
        })}
        {hint && (
          <span className="ml-auto text-[11px] text-[var(--color-gray-400)]">
            {hint}
          </span>
        )}
      </div>
      {tabs.map((t) => (
        <div key={t.key} hidden={t.key !== active}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
