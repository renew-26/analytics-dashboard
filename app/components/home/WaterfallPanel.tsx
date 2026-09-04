"use client";

import { useState } from "react";
import Link from "next/link";
import Waterfall, { type WaterfallItem } from "./Waterfall";
import { deltaColor, deltaArrow } from "./cardKit";

/**
 * 렌탈사 기여 — 선택된 지표와 같은 축으로 그린다.
 * href가 없으면 상세 페이지가 없는 이름이라 링크로 만들지 않는다.
 */
export type Mover = { label: string; value: number; href?: string };

export type WaterfallMetric = {
  key: string;
  label: string;
  unit: string;
  decimals: number;
  /** 전월 동기간 대비 증감률 — 탭에 상시 노출한다 */
  changePct: number | null;
  items: WaterfallItem[];
  movers: Mover[];
};

/** 증가·감소 각각 몇 곳까지 세울지 — 캡션에 그대로 노출한다 */
const MOVER_LIMIT = 5;

function fmt(n: number, decimals: number) {
  return n.toLocaleString("ko-KR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function signed(n: number, decimals: number) {
  return `${n > 0 ? "+" : ""}${fmt(n, decimals)}`;
}

/**
 * "이번 달 실적은 왜 변했나" — 전월 동기간 → 이번 달을 분해한다.
 *
 * 지표를 건수 하나로 끝내지 않는 이유: 건수 +66%인데 매출 +56%면 건당 매출이
 * 빠지고 있다는 뜻이고, 그건 건수 워터폴만 보면 절대 안 나온다. 그래서 탭에
 * 네 지표의 증감률을 상시 띄워 괴리 자체가 먼저 눈에 걸리게 한다.
 */
export default function WaterfallPanel({
  metrics,
  panelClass,
}: {
  metrics: WaterfallMetric[];
  panelClass: string;
}) {
  const [active, setActive] = useState(0);
  const m = metrics[active] ?? metrics[0];
  if (!m) return null;

  const deltas = m.items.filter((it) => it.type === "delta" && it.value !== 0);
  const ranked = [...deltas].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const topPos = ranked.find((it) => it.value > 0);
  const topNeg = ranked.find((it) => it.value < 0);

  const first = m.items[0]?.value ?? 0;
  const last = m.items[m.items.length - 1]?.value ?? 0;
  const net = last - first;

  const ups = m.movers.filter((x) => x.value > 0).slice(0, MOVER_LIMIT);
  const downs = m.movers
    .filter((x) => x.value < 0)
    .sort((a, b) => a.value - b.value)
    .slice(0, MOVER_LIMIT);
  const moverMax = Math.max(
    1e-9,
    ...[...ups, ...downs].map((x) => Math.abs(x.value)),
  );

  return (
    <div className={panelClass}>
      <div className="flex flex-wrap items-baseline justify-between gap-2.5 p-[14px_17px_11px]">
        <h3 className="text-[14px] font-bold tracking-[-.2px]">
          이번 달 실적은 왜 변했나
        </h3>
        <span className="text-[11px] text-[var(--color-gray-400)]">
          전월 동기간 → 이번 달 · 막대 클릭 시 상세 페이지
        </span>
      </div>

      {/* 지표 탭 — 라벨 옆 증감률이 곧 지표 간 괴리 표시다 */}
      <div
        role="tablist"
        aria-label="분해할 지표"
        className="flex flex-wrap gap-1.5 px-[17px] pb-3"
      >
        {metrics.map((k, i) => {
          const on = i === active;
          return (
            <button
              key={k.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActive(i)}
              className={`flex items-baseline gap-[7px] rounded-[8px] border px-[11px] py-[7px] text-left transition-colors duration-[120ms] ${
                on
                  ? "border-[var(--color-primary)] bg-[var(--color-primary-50)]"
                  : "border-[var(--color-gray-200)] bg-white hover:border-[var(--color-gray-400)]"
              }`}
            >
              <span
                className={`text-[12px] font-semibold ${
                  on
                    ? "text-[var(--color-primary-700)]"
                    : "text-[var(--color-gray-600)]"
                }`}
              >
                {k.label}
              </span>
              <span
                className="num text-[12px] font-bold whitespace-nowrap"
                style={{
                  color:
                    k.changePct === null
                      ? "var(--color-gray-400)"
                      : deltaColor(k.changePct),
                }}
              >
                {k.changePct === null
                  ? "—"
                  : `${deltaArrow(k.changePct)} ${Math.abs(k.changePct).toFixed(1)}%`}
              </span>
            </button>
          );
        })}
      </div>

      {/* 2단은 2xl(1536px) 부터 — 그 아래에서 2단으로 쪼개면 워터폴 칼럼이 좁아지고
          비율이 고정된 SVG 높이가 같이 줄어 옆 목록과 높이가 크게 벌어진다.
          단일 컬럼에서는 워터폴이 폭을 다 쓰므로 공백이 생기지 않는다. */}
      <div className="grid grid-cols-1 items-start gap-6 px-[17px] pb-4 2xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div>
          <div className="mb-1 text-[11px] text-[var(--color-gray-400)]">
            {m.label} · 대카테고리 기여도 · 단위 {m.unit}
          </div>
          <Waterfall items={m.items} decimals={m.decimals} unit={m.unit} />
          {(topPos || topNeg) && (
            <p className="mt-3 rounded-r-[6px] border-l-2 border-[var(--color-primary)] bg-[var(--color-primary-50)] px-[11px] py-[7px] text-[12px] leading-[1.6] text-[var(--color-primary-700)]">
              합계{" "}
              <b>
                {signed(net, m.decimals)}
                {m.unit}
              </b>{" "}
              안에 가려진 것 —{" "}
              {topPos && (
                <>
                  최대 증가{" "}
                  <b>
                    {topPos.label} {signed(topPos.value, m.decimals)}
                    {m.unit}
                  </b>
                  {topNeg && ", "}
                </>
              )}
              {topNeg && (
                <>
                  최대 감소{" "}
                  <b>
                    {topNeg.label} {signed(topNeg.value, m.decimals)}
                    {m.unit}
                  </b>
                </>
              )}
              . 합계만 보면 읽어낼 수 없는 부분입니다.
            </p>
          )}
        </div>

        {/* 렌탈사 기여 — 카테고리 축으로 답한 변화를 렌탈사 축으로 한 번 더 답한다 */}
        <div>
          <div className="mb-0.5 text-[12px] font-bold text-[var(--color-gray-600)]">
            어느 렌탈사에서 왔나
          </div>
          <div className="mb-2.5 text-[11px] text-[var(--color-gray-400)]">
            {m.label} 증감 기여 · 전월 동기간 대비 · 단위 {m.unit} · 증가·감소
            각 상위 {MOVER_LIMIT}곳
          </div>

          {ups.length === 0 && downs.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-[var(--color-gray-400)]">
              기여를 가를 만한 렌탈사 변화가 없습니다.
            </p>
          ) : (
            <div className="space-y-3">
              {[
                { title: "증가", rows: ups, color: "var(--color-up)" },
                { title: "감소", rows: downs, color: "var(--color-down)" },
              ].map((blk) =>
                blk.rows.length === 0 ? null : (
                  <div key={blk.title}>
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-[.06em] text-[var(--color-gray-400)]">
                      {blk.title}
                    </div>
                    <ul>
                      {blk.rows.map((r) => {
                        const row = (
                          <>
                            <span className="truncate text-[12px] font-semibold group-hover:text-[var(--color-primary)]">
                              {r.label}
                            </span>
                            <span className="h-[7px] rounded-[4px] bg-[var(--color-gray-100)]">
                              <span
                                className="block h-full rounded-[4px]"
                                style={{
                                  width: `${(Math.abs(r.value) / moverMax) * 100}%`,
                                  background: blk.color,
                                }}
                              />
                            </span>
                            <b
                              className="num text-[12px] font-bold whitespace-nowrap tracking-[-.2px]"
                              style={{ color: blk.color }}
                            >
                              {signed(r.value, m.decimals)}
                            </b>
                          </>
                        );
                        const grid =
                          "group grid grid-cols-[minmax(72px,auto)_minmax(0,1fr)_auto] items-center gap-[9px] py-[7px]";
                        return (
                          <li
                            key={r.label}
                            className="border-t border-[var(--color-line-2)] first:border-t-0"
                          >
                            {r.href ? (
                              <Link href={r.href} className={grid}>
                                {row}
                              </Link>
                            ) : (
                              <div className={grid}>{row}</div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
