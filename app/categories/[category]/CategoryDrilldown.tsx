"use client";

import { useState } from "react";
import Link from "next/link";
import WaterfallPanel, {
  type WaterfallMetric,
} from "@/app/components/home/WaterfallPanel";
import { type AxisAgg } from "@/lib/category-aggregate";
import { type ConvStats } from "@/lib/conversion";
import { EOK, fmt, signedInt } from "@/lib/format";
import { manwon, deltaColor } from "@/app/components/home/cardKit";

export type ProductDelta = {
  product: string;
  company: string;
  brand: string;
  cnt: number;
  cntPrev: number;
  href?: string;
};

/**
 * 건수 증감 — 비율이 아니라 절대 건수라 데드존(±1.5)을 쓰지 않는다.
 * `Delta` 는 증감률 전용이라 `+1건` 을 넘기면 회색 `—` 로 죽는다.
 */
function DeltaCount({ value }: { value: number }) {
  if (value === 0)
    return <span className="num text-[var(--color-gray-400)]">—</span>;
  return (
    <span className="num font-semibold" style={{ color: deltaColor(value, 0) }}>
      {signedInt(value)}
      <i className="ml-0.5 text-[10px] font-medium not-italic text-[var(--color-gray-500)]">
        건
      </i>
    </span>
  );
}

/**
 * 렌탈사(1차) → 브랜드(2차) → 상품(3차) 드릴다운.
 *
 * 렌탈사 선택이 ④ 표와 ⑤ 브랜드 표 두 곳에 걸쳐 있어 서버 컴포넌트로는
 * 못 나눈다 — 선택을 가진 부분만 여기로 내렸다.
 */
export default function CategoryDrilldown({
  groupKey,
  metrics,
  companies,
  brandByCompany,
  convByCompany,
  prodUp,
  prodDown,
  initialCompany,
  panelClass,
  sectionHead,
}: {
  groupKey: string;
  metrics: WaterfallMetric[];
  companies: AxisAgg[];
  brandByCompany: Record<string, AxisAgg[]>;
  convByCompany: Record<string, ConvStats>;
  prodUp: ProductDelta[];
  prodDown: ProductDelta[];
  /** ?company= 딥링크. 목록에 없으면 무시하고 1위 렌탈사를 연다. */
  initialCompany?: string;
  panelClass: string;
  sectionHead: string;
}) {
  const valid = companies.some((c) => c.label === initialCompany);
  const [selected, setSelected] = useState<string>(
    valid ? initialCompany! : (companies[0]?.label ?? ""),
  );
  const brands = brandByCompany[selected] ?? [];
  const totalCnt = companies.reduce((s, c) => s + c.cnt, 0);

  const th =
    "bg-[var(--color-gray-25)] p-[8px_12px] text-right text-[11px] font-bold whitespace-nowrap text-[var(--color-gray-400)]";
  const td = "p-[8px_12px] text-right whitespace-nowrap";

  return (
    <>
      {/* ── ③ 왜 변했나 ─────────────────────────────── */}
      <section>
        <h2 className={`mb-[11px] ${sectionHead}`}>
          이번 달 {groupKey}는 왜 변했나
        </h2>
        <WaterfallPanel metrics={metrics} panelClass={panelClass} />
        <div className={`${panelClass} mt-[11px] overflow-hidden`}>
          <h3 className="border-b border-[var(--color-line-2)] p-[11px_15px] text-[12px] font-semibold text-[var(--color-gray-600)]">
            어떤 상품이 움직였나
          </h3>
          <div className="grid gap-px bg-[var(--color-line-2)] md:grid-cols-2">
            {[
              { title: "증가 TOP10", list: prodUp },
              { title: "감소 TOP10", list: prodDown },
            ].map((col) => (
              <div key={col.title} className="bg-white p-[11px_15px_13px]">
                <p className="mb-[6px] text-[10px] font-bold tracking-wider text-[var(--color-gray-400)] uppercase">
                  {col.title}
                </p>
                {col.list.length === 0 ? (
                  <p className="text-[12px] text-[var(--color-gray-400)]">
                    해당 없음
                  </p>
                ) : (
                  <ul>
                    {col.list.map((p) => (
                      <li
                        key={`${p.company}/${p.product}`}
                        className="flex items-baseline justify-between gap-3 border-b border-[var(--color-line-2)] py-[5px] last:border-0"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[12px] font-medium text-[var(--color-gray-900)]">
                            {p.href ? (
                              <Link href={p.href} className="hover:underline">
                                {p.product}
                              </Link>
                            ) : (
                              p.product
                            )}
                          </span>
                          <span className="block text-[10px] text-[var(--color-gray-400)]">
                            {p.brand} · {p.company}
                          </span>
                        </span>
                        <DeltaCount value={p.cnt - p.cntPrev} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ④ 렌탈사별 성과 ─────────────────────────── */}
      <section>
        <h2 className={`mb-[11px] ${sectionHead}`}>렌탈사별 성과</h2>
        <div className={`${panelClass} overflow-x-auto`}>
          <table className="w-full min-w-[900px] bg-white text-[12px]">
            <thead>
              <tr>
                <th className={`${th} text-left`}>렌탈사</th>
                <th className={th}>계약</th>
                <th className={th}>전월</th>
                <th className={th}>증감</th>
                <th className={th}>점유율</th>
                <th className={th}>전환율</th>
                <th className={th}>리드타임</th>
                <th className={th}>거래액</th>
                <th className={th}>매출</th>
                <th className={th}>건당 공헌이익</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => {
                const cv = convByCompany[c.label];
                const on = c.label === selected;
                return (
                  <tr
                    key={c.label}
                    onClick={() => setSelected(c.label)}
                    className={`cursor-pointer border-t border-[var(--color-line-2)] ${
                      on
                        ? "bg-[var(--color-primary-50)]"
                        : "hover:bg-[var(--color-gray-25)]"
                    }`}
                  >
                    <td className="p-[8px_12px] text-left font-semibold">
                      {c.label}
                    </td>
                    <td className={`${td} num`}>{fmt(c.cnt)}</td>
                    <td className={`${td} num text-[var(--color-gray-500)]`}>
                      {fmt(c.cntPrev)}
                    </td>
                    <td className={td}>
                      <DeltaCount value={c.cnt - c.cntPrev} />
                    </td>
                    <td className={`${td} num`}>
                      {totalCnt > 0
                        ? `${((c.cnt / totalCnt) * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className={`${td} num`}>
                      {cv?.rate == null
                        ? "—"
                        : `${(cv.rate * 100).toFixed(0)}%`}
                    </td>
                    <td className={`${td} num`}>
                      {cv?.avgDays == null ? "—" : `${cv.avgDays.toFixed(1)}일`}
                    </td>
                    <td className={`${td} num`}>{(c.amount / EOK).toFixed(2)}</td>
                    <td className={`${td} num`}>{(c.sales / EOK).toFixed(2)}</td>
                    <td className={`${td} num`}>
                      {manwon(c.cnt > 0 ? c.margin / c.cnt : 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-[6px] text-[11px] text-[var(--color-gray-500)]">
          행을 누르면 아래 브랜드별 성과가 그 렌탈사로 바뀐다.
        </p>
      </section>

      {/* ── ⑤ 브랜드별 성과 ─────────────────────────── */}
      <section>
        <h2 className={`mb-[11px] ${sectionHead}`}>
          브랜드별 성과
          <span className="ml-2 text-[12px] font-semibold text-[var(--color-gray-500)]">
            {selected}
          </span>
        </h2>
        <div className={`${panelClass} overflow-x-auto`}>
          <table className="w-full min-w-[720px] bg-white text-[12px]">
            <thead>
              <tr>
                <th className={`${th} text-left`}>브랜드</th>
                <th className={th}>계약</th>
                <th className={th}>전월</th>
                <th className={th}>증감</th>
                <th className={th}>거래액</th>
                <th className={th}>매출</th>
                <th className={th}>건당 공헌이익</th>
              </tr>
            </thead>
            <tbody>
              {brands.map((b) => (
                <tr
                  key={b.label}
                  className="border-t border-[var(--color-line-2)]"
                >
                  <td className="p-[8px_12px] text-left font-semibold">
                    {b.label}
                  </td>
                  <td className={`${td} num`}>{fmt(b.cnt)}</td>
                  <td className={`${td} num text-[var(--color-gray-500)]`}>
                    {fmt(b.cntPrev)}
                  </td>
                  <td className={td}>
                    <DeltaCount value={b.cnt - b.cntPrev} />
                  </td>
                  <td className={`${td} num`}>{(b.amount / EOK).toFixed(2)}</td>
                  <td className={`${td} num`}>{(b.sales / EOK).toFixed(2)}</td>
                  <td className={`${td} num`}>
                    {manwon(b.cnt > 0 ? b.margin / b.cnt : 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
