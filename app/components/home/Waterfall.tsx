import Link from "next/link";

export type WaterfallItem = {
  label: string;
  /** total = 시작·끝 합계 막대, delta = 기여도 막대 */
  type: "total" | "delta";
  value: number;
  /** delta 막대 클릭 시 이동할 경로 */
  href?: string;
};

/**
 * "무엇이 이 달을 만들었나" — 전월 동기간 → 이번 달을 카테고리 기여도로 분해한다.
 *
 * 축이 0에서 시작하지 않으므로(합계가 4천 단위인데 변화는 수십~수백 단위라
 * 0부터 그리면 델타가 보이지 않는다) 밑동에 시작값을 명시한다.
 */
export default function Waterfall({ items }: { items: WaterfallItem[] }) {
  if (items.length < 2) return null;

  const W = 1000;
  const H = 268;
  const padL = 52;
  const padR = 16;
  const padT = 28;
  const padB = 38;
  const slot = (W - padL - padR) / items.length;
  const bw = Math.min(34, slot * 0.30);
  const floor = H - padB;

  // 누적 좌표: delta는 직전 누계 위에 쌓인다
  let run = 0;
  const bars = items.map((d) => {
    if (d.type === "total") {
      run = d.value;
      return { d, y0: 0, y1: d.value };
    }
    const y0 = run;
    run += d.value;
    return { d, y0, y1: run };
  });

  // 표시 범위 — 합계와 누계가 모두 들어가되 여백을 남긴다
  const marks = bars.flatMap((b) =>
    b.d.type === "total" ? [b.d.value] : [b.y0, b.y1],
  );
  const dataLo = Math.min(...marks);
  const dataHi = Math.max(...marks);
  const range = dataHi - dataLo || Math.max(1, dataHi * 0.1);
  const rawLo = Math.max(0, dataLo - range * 0.55);
  const hi = dataHi + range * 0.35;

  // 격자는 "좋은" 반올림 자리를 쓰되 개수가 너무 성겨지지 않게 고른다
  const step = gridStep(hi - rawLo, 10);
  // 밑동을 격자 간격에 스냅시킨다. 안 그러면 밑동 라벨(2,645↓)과
  // 최저 격자 라벨(2,650)이 몇 px 차이로 겹쳐 읽힌다.
  const lo = Math.max(0, Math.floor(rawLo / step) * step);
  const Y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);

  // 밑동 자체가 이미 lo를 표시하므로 격자는 한 칸 위부터 그린다
  const grid: number[] = [];
  for (let g = lo + step; g < hi; g += step) grid.push(g);

  const nf = (n: number) => Math.round(n).toLocaleString("ko-KR");

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="전월 동기간 대비 대카테고리 기여도 워터폴"
      style={{ display: "block", width: "100%" }}
    >
      {grid.map((g) => (
        <g key={g}>
          <line
            x1={padL}
            x2={W - padR}
            y1={Y(g)}
            y2={Y(g)}
            stroke="var(--color-line-2)"
            strokeWidth="1"
          />
          <text
            x={padL - 8}
            y={Y(g) + 3.5}
            fill="var(--color-gray-400)"
            fontSize="9.5"
            textAnchor="end"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {nf(g)}
          </text>
        </g>
      ))}

      {/* 축이 0이 아님을 명시 */}
      <line
        x1={padL - 6}
        x2={W - padR}
        y1={floor}
        y2={floor}
        stroke="var(--color-gray-200)"
        strokeWidth="1"
      />
      <text
        x={padL - 8}
        y={floor + 3.5}
        fill="var(--color-gray-400)"
        fontSize="9"
        textAnchor="end"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {nf(lo)}↓
      </text>

      {bars.map((b, i) => {
        const cx = padL + slot * i + slot / 2;
        const x = cx - bw / 2;
        const isTotal = b.d.type === "total";
        const top = isTotal ? Y(b.d.value) : Math.min(Y(b.y0), Y(b.y1));
        const bot = isTotal ? floor : Math.max(Y(b.y0), Y(b.y1));
        const hgt = Math.max(3, bot - top);
        const color = isTotal
          ? "var(--color-gray-600)"
          : b.d.value > 0
            ? "var(--color-up)"
            : "var(--color-down)";

        const prev = bars[i - 1];
        const linkY = prev
          ? Y(prev.d.type === "total" ? prev.d.value : prev.y1)
          : 0;

        const bar = (
          <>
            {prev && (
              <line
                x1={padL + slot * (i - 1) + slot / 2 + bw / 2}
                x2={x}
                y1={linkY}
                y2={linkY}
                stroke="var(--color-gray-200)"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
            )}
            <rect
              x={x}
              y={top}
              width={bw}
              height={hgt}
              rx="4"
              fill={color}
              fillOpacity={isTotal ? 1 : 0.92}
            />
            <text
              x={cx}
              y={top - 6}
              fill={isTotal ? "var(--color-gray-900)" : color}
              fontSize="11"
              fontWeight="700"
              textAnchor="middle"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {isTotal
                ? nf(b.d.value)
                : `${b.d.value > 0 ? "+" : ""}${nf(b.d.value)}`}
            </text>
            <text
              x={cx}
              y={H - padB + 16}
              fill={isTotal ? "var(--color-gray-600)" : "var(--color-gray-500)"}
              fontSize="10"
              fontWeight={isTotal ? 700 : 500}
              textAnchor="middle"
            >
              {b.d.label.length > 6 ? `${b.d.label.slice(0, 5)}…` : b.d.label}
              <title>{b.d.label}</title>
            </text>
          </>
        );

        return b.d.href ? (
          <Link key={b.d.label} href={b.d.href}>
            {bar}
          </Link>
        ) : (
          <g key={b.d.label}>{bar}</g>
        );
      })}
    </svg>
  );
}

/**
 * 눈금 간격 선택.
 *
 * 단순히 range/n 을 올림하면 29.3 → 50 처럼 한 단계가 통째로 건너뛰어
 * 격자가 절반으로 성겨진다. 그래서 1·2·2.5·5 × 10ⁿ 후보를 작은 것부터
 * 훑어 "선 개수가 maxLines 이하가 되는 가장 촘촘한 간격"을 고른다.
 */
function gridStep(range: number, maxLines: number) {
  if (!Number.isFinite(range) || range <= 0) return 1;
  const mags = [range / 1000, range].map((v) =>
    Math.floor(Math.log10(Math.max(v, 1e-9))),
  );
  for (let e = mags[0]; e <= mags[1] + 1; e++) {
    for (const m of [1, 2, 2.5, 5]) {
      const step = m * 10 ** e;
      if (step > 0 && range / step <= maxLines) return step;
    }
  }
  return range / maxLines;
}
