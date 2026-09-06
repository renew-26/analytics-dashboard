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
 * 최대 증가·감소 요인 한 장.
 *
 * 방향색(빨강=증가, 파랑=감소)은 변화량에만 쓴다 — 여기 값은 순수한 변화량이라
 * 규칙 그대로다. 다만 색만으로 뜻을 전하지 않도록 "상승/하락"이라는
 * 역할 라벨을 항상 붙인다.
 */
function TopDriver({
  role,
  label,
  value,
  unit,
  positive,
  share,
  href,
}: {
  role: string;
  label: string;
  value: string;
  unit: string;
  positive: boolean;
  share: number | null;
  href?: string;
}) {
  const color = positive ? "var(--color-up)" : "var(--color-down)";
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-bold tracking-[.04em] text-[var(--color-gray-500)]">
          {role}
        </span>
        {/* 증가·감소가 서로 상쇄하면 한 곳의 기여가 순변화를 넘는다.
            그때 "변화폭의 340%"는 뜻이 없으므로 말을 바꾼다. */}
        {share !== null && (
          <span className="num text-[10px] text-[var(--color-gray-400)]">
            {share > 100
              ? "합계 변화보다 큼"
              : `합계 변화의 ${share.toFixed(0)}%`}
          </span>
        )}
      </div>
      <div className="mt-[5px] flex items-baseline justify-between gap-2">
        <b className="truncate text-[15px] font-bold tracking-[-.3px] group-hover:text-[var(--color-primary)]">
          {label}
        </b>
        <b
          className="num flex-none text-[15px] font-bold tracking-[-.3px]"
          style={{ color }}
        >
          {value}
          <i className="ml-px text-[11px] font-semibold not-italic tracking-normal opacity-70">
            {unit}
          </i>
        </b>
      </div>
      {href && (
        <div className="mt-[5px] flex items-center gap-1 font-mono text-[10px] text-[var(--color-gray-400)] group-hover:text-[var(--color-primary)]">
          <span>{decodeURIComponent(href)}</span>
          <span aria-hidden>↗</span>
        </div>
      )}
    </>
  );
  const shell =
    "group block rounded-[8px] border-l-[3px] border border-[var(--color-gray-200)] bg-white px-[13px] py-[10px]";
  return href ? (
    <Link
      href={href}
      className={`${shell} transition-colors duration-[var(--dur-hover)] ease-[var(--ease-out)] hover:border-[var(--color-primary-500)] hover:bg-[var(--color-primary-50)]`}
      style={{ borderLeftColor: color }}
    >
      {body}
    </Link>
  ) : (
    <div className={shell} style={{ borderLeftColor: color }}>
      {body}
    </div>
  );
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
          변화 분해
        </h3>
        <span className="text-[11px] text-[var(--color-gray-400)]">
          전월 동기간 → 이번 달 · 막대·행을 누르면 상세 페이지
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
              className={`press flex items-baseline gap-[7px] rounded-[8px] border px-[11px] py-[7px] text-left transition-colors duration-[var(--dur-hover)] ease-[var(--ease-out)] ${
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

      {/* 가장 큰 원인을 먼저 세운다 — 워터폴은 "얼마나 많은 곳이 움직였나"에는
          답하지만 "그래서 어디냐"에는 스스로 답하지 않는다. 막대 열두 개를
          눈으로 재게 두지 않고, 최대 증가·최대 감소를 뽑아 앞에 놓는다. */}
      {(topPos || topNeg) && (
        <div className="grid grid-cols-1 gap-2.5 px-[17px] pb-3 sm:grid-cols-2">
          {[
            { role: "가장 크게 하락", it: topNeg },
            { role: "가장 크게 상승", it: topPos },
          ].map(({ role, it }) =>
            !it ? null : (
              <TopDriver
                key={role}
                role={role}
                label={it.label}
                value={signed(it.value, m.decimals)}
                unit={m.unit}
                positive={it.value > 0}
                share={net !== 0 ? Math.abs(it.value / net) * 100 : null}
                href={it.href}
              />
            ),
          )}
        </div>
      )}

      {/* 2단은 2xl(1536px) 부터 — 그 아래에서 2단으로 쪼개면 워터폴 칼럼이 좁아지고
          비율이 고정된 SVG 높이가 같이 줄어 옆 목록과 높이가 크게 벌어진다.
          단일 컬럼에서는 워터폴이 폭을 다 쓰므로 공백이 생기지 않는다. */}
      <div className="grid grid-cols-1 items-start gap-6 px-[17px] pb-4 2xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div>
          <div className="mb-1 flex flex-wrap items-baseline gap-1.5 text-[11px] text-[var(--color-gray-400)]">
            <b className="rounded-[4px] bg-[var(--color-gray-100)] px-1.5 py-px text-[10px] font-bold text-[var(--color-gray-500)]">
              1단계 · 대카테고리
            </b>
            {m.label} 기여도 · 단위 {m.unit}
          </div>
          <Waterfall items={m.items} decimals={m.decimals} unit={m.unit} />
        </div>

        {/* 렌탈사 기여 — 카테고리 축으로 답한 변화를 렌탈사 축으로 한 번 더 답한다 */}
        <div>
          <div className="mb-0.5 flex flex-wrap items-baseline gap-1.5">
            <b className="rounded-[4px] bg-[var(--color-gray-100)] px-1.5 py-px text-[10px] font-bold text-[var(--color-gray-500)]">
              2단계 · 렌탈사
            </b>
            <span className="text-[12px] font-bold text-[var(--color-gray-600)]">
              어느 렌탈사에서 왔나
            </span>
          </div>
          <div className="mb-2.5 text-[11px] text-[var(--color-gray-400)]">
            증가·감소 각 상위 {MOVER_LIMIT}곳 · 단위 {m.unit} · 상품 단위까지는
            렌탈사 상세에서 이어진다
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
                              className="num flex items-baseline gap-1 text-[12px] font-bold whitespace-nowrap tracking-[-.2px]"
                              style={{ color: blk.color }}
                            >
                              {signed(r.value, m.decimals)}
                              <i
                                aria-hidden
                                className={`text-[10px] not-italic ${
                                  r.href
                                    ? "text-[var(--color-gray-250)] group-hover:text-[var(--color-primary)]"
                                    : "invisible"
                                }`}
                              >
                                ↗
                              </i>
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
