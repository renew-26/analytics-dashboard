import { DeltaText, EmptyState, TableScroll, n, pct } from "./ui";

export type TopModelRow = {
  modelName: string;
  productName: string;
  count: number;
  currCount: number;
  prevCount: number;
  avgFee: number | null;
  /** 카테고리 평균 월렌탈료 대비 (%) */
  vsAvg: number | null;
  marginRate: number | null;
  leadCompany: string;
  leadShare: number;
};

export default function TopModelTable({
  rows,
  maxCount,
}: {
  rows: TopModelRow[];
  maxCount: number;
}) {
  if (rows.length === 0) {
    return <EmptyState>이 구간에 모델이 식별된 거래가 없습니다.</EmptyState>;
  }

  return (
    <TableScroll>
      <table className="w-full min-w-[820px] text-[12px]">
        <thead>
          <tr className="bg-[var(--color-gray-25)]">
            {[
              ["모델", "left"],
              ["최근 3개월", "right"],
              ["이번 기간", "right"],
              ["전월 동기간 대비", "right"],
              ["평균 월렌탈료", "right"],
              ["카테고리 평균 대비", "right"],
              ["공헌이익률", "right"],
              ["주력 렌탈사", "right"],
            ].map(([label, align], i) => (
              <th
                key={label}
                className={`border-b border-[var(--color-gray-200)] px-3 py-2.5 text-[11px] font-bold whitespace-nowrap text-[var(--color-gray-400)] ${
                  align === "left" ? "text-left" : "text-right"
                } ${
                  i === 0
                    ? "sticky left-0 z-10 min-w-[210px] bg-[var(--color-gray-25)]"
                    : ""
                }`}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.modelName}
              className="border-t border-[var(--color-line-2)]"
            >
              <td className="sticky left-0 z-10 bg-white px-3 py-2.5 text-left">
                <span className="block font-bold text-[var(--color-gray-800)]">
                  {r.productName || r.modelName}
                </span>
                <span className="mt-[1px] block font-mono text-[11px] text-[var(--color-gray-400)]">
                  {r.modelName}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap">
                <span className="inline-flex items-center justify-end gap-2">
                  <b className="num font-bold text-[var(--color-gray-900)]">
                    {n(r.count)}
                  </b>
                  <i
                    className="block h-[7px] rounded-[2px] bg-[var(--color-primary)]"
                    style={{
                      width: `${Math.max(2, (r.count / maxCount) * 44)}px`,
                    }}
                  />
                </span>
              </td>
              <td className="num px-3 py-2.5 text-right whitespace-nowrap text-[var(--color-gray-600)]">
                {n(r.currCount)}
              </td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap">
                <DeltaText value={r.currCount - r.prevCount} />
              </td>
              <td className="num px-3 py-2.5 text-right whitespace-nowrap text-[var(--color-gray-800)]">
                {r.avgFee === null ? "—" : `${n(r.avgFee)}원`}
              </td>
              <td className="num px-3 py-2.5 text-right whitespace-nowrap text-[var(--color-gray-600)]">
                {r.vsAvg === null
                  ? "—"
                  : `${r.vsAvg > 0 ? "+" : ""}${r.vsAvg.toFixed(1)}%`}
              </td>
              <td className="num px-3 py-2.5 text-right whitespace-nowrap text-[var(--color-gray-800)]">
                {pct(r.marginRate)}
              </td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap text-[var(--color-gray-600)]">
                {r.leadCompany}
                <span className="num ml-1 text-[11px] text-[var(--color-gray-400)]">
                  {pct(r.leadShare, 0)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}
