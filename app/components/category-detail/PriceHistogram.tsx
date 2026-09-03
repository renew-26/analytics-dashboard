import { EmptyState, n, pct } from "./ui";

export type PriceBin = {
  label: string;
  total: number;
  rentre: number;
};

export default function PriceHistogram({ bins }: { bins: PriceBin[] }) {
  const grandTotal = bins.reduce((s, b) => s + b.total, 0);
  if (grandTotal === 0) {
    return <EmptyState>월렌탈료가 기록된 거래가 없습니다.</EmptyState>;
  }
  const max = Math.max(...bins.map((b) => b.total));

  return (
    <div>
      <ul className="flex flex-col gap-[6px]">
        {bins.map((b) => (
          <li key={b.label} className="flex items-center gap-2.5">
            <span className="num w-[92px] shrink-0 text-right text-[11.5px] text-[var(--color-gray-600)]">
              {b.label}
            </span>
            <span className="relative block h-[18px] flex-1 rounded-[3px] bg-[var(--color-gray-100)]">
              <i
                className="absolute top-0 left-0 h-full rounded-[3px] bg-[var(--color-primary)]"
                style={{ width: `${(b.total / max) * 100}%`, opacity: 0.85 }}
              />
              {b.rentre > 0 ? (
                <i
                  className="absolute top-0 left-0 h-full rounded-[3px] border-r-2 border-[var(--color-gray-900)] bg-[var(--color-primary-700)]"
                  style={{ width: `${(b.rentre / max) * 100}%` }}
                  title={`렌트리 채널 ${n(b.rentre)}건`}
                />
              ) : null}
            </span>
            <span className="num w-[112px] shrink-0 text-right text-[11.5px] whitespace-nowrap text-[var(--color-gray-800)]">
              {n(b.total)}건
              <span className="text-[var(--color-gray-400)]">
                {" "}
                ({pct((b.total / grandTotal) * 100, 0)})
              </span>
            </span>
            <span className="num w-[92px] shrink-0 text-right text-[11.5px] whitespace-nowrap text-[var(--color-gray-500)]">
              렌트리 {n(b.rentre)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--color-gray-600)]">
        <span className="inline-flex items-center gap-1.5">
          <i
            className="block h-[9px] w-[9px] rounded-[2px] bg-[var(--color-primary)]"
            style={{ opacity: 0.85 }}
          />
          전체 계약 건수
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="block h-[9px] w-[9px] rounded-[2px] bg-[var(--color-primary-700)]" />
          그중 렌트리 채널
        </span>
      </div>
    </div>
  );
}
