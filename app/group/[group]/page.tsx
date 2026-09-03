import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { COMPANY_MAP, matchesEntry } from "@/lib/company-map";
import { getPeriod, formatShortRange } from "@/lib/period";
import { deltaColor as dirColor } from "@/app/components/home/cardKit";

export const dynamic = "force-dynamic";

// 사이드바 노출 순서와 같게 고정한다 (COMPANY_MAP 선언 순서는 가전&상조가 먼저다)
const GROUP_ORDER = ["정수기", "가전&상조", "통신"];

// 정수기·통신은 같은 상품을 두고 정면 경쟁이라 "점유율 = 제로섬" 축이 성립한다.
// 가전&상조는 회사마다 주력 카테고리가 달라 한 시장이 아니므로 카테고리 매트릭스를 쓴다.
const GROUP_MODE: Record<string, "share" | "matrix"> = {
  정수기: "share",
  "가전&상조": "matrix",
  통신: "share",
};

// 계열 색 — DESIGN.md 규칙대로 순서대로 쓰고, 6번째부터는 "그 외"로 묶는다
const CAT_COLORS = [
  "var(--color-cat-1)",
  "var(--color-cat-2)",
  "var(--color-cat-3)",
  "var(--color-cat-4)",
  "var(--color-cat-5)",
];
const REST_COLOR = "var(--color-gray-350)";
const SERIES_MAX = 5;

const panel =
  "rounded-[12px] border border-[var(--color-gray-200)] bg-white shadow-[0_1px_2px_rgba(28,35,56,.04),0_2px_8px_rgba(28,35,56,.05)]";

const nf = (n: number) => Math.round(n).toLocaleString("ko-KR");
const pct = (v: number, t: number) => (t > 0 ? (v / t) * 100 : 0);
const signed = (n: number, digits = 1) =>
  `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}`;
const signedInt = (n: number) =>
  n === 0 ? "0" : `${n > 0 ? "+" : "−"}${nf(Math.abs(n))}`;

// ── 데이터 ───────────────────────────────────────────────
const PAGE = 50000;

type ContractRow = {
  rental_company: string | null;
  category: string | null;
  monthly_fee: number | null;
  contribution_margin: number | null;
  sales: number | null;
};

type OrderRow = {
  rental_company: string | null;
  category: string | null;
};

async function fetchContracts(
  dbNames: string[],
  start: string,
  end: string,
): Promise<ContractRow[]> {
  const all: ContractRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("raw_contracts")
      .select(
        "rental_company, category, monthly_fee, contribution_margin, sales",
      )
      .in("rental_company", dbNames)
      .gte("contract_date", start)
      .lte("contract_date", end)
      .order("prop_item_usid", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function fetchOrders(
  dbNames: string[],
  start: string,
  end: string,
): Promise<OrderRow[]> {
  const all: OrderRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("raw_orders")
      .select("rental_company, category")
      .in("rental_company", dbNames)
      .gte("order_confirmed_at", start)
      .lte("order_confirmed_at", end)
      .order("prop_item_usid", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export default async function GroupPage({
  params,
}: {
  params: Promise<{ group: string }>;
}) {
  const group = decodeURIComponent((await params).group);
  const entries = COMPANY_MAP.filter((c) => c.group === group);
  if (entries.length === 0) notFound();

  const mode = GROUP_MODE[group] ?? "share";
  const { curr, prev, month } = getPeriod();
  const dbNames = Array.from(new Set(entries.map((e) => e.dbName)));

  const [currRows, prevRows, currOrders] = await Promise.all([
    fetchContracts(dbNames, curr.start, curr.end),
    fetchContracts(dbNames, prev.start, prev.end),
    fetchOrders(dbNames, curr.start, curr.end),
  ]);

  // dbName만으로는 LG/KT/BS렌탈이 두 라벨에 섞이므로 categoryIs/Not까지 본다.
  // 이 그룹에 속하지 않는 행(예: 가전&상조 조회에 딸려온 KT 인터넷)은 null → 제외.
  const labelOf = (dbName: string | null, category: string | null) => {
    if (!dbName) return null;
    for (const e of entries) {
      if (e.dbName !== dbName) continue;
      if (!matchesEntry(e, category)) continue;
      return e.label;
    }
    return null;
  };

  type Agg = {
    label: string;
    cur: number;
    prev: number;
    orders: number;
    feeSum: number;
    feeCount: number;
    sales: number;
    margin: number;
    cats: Map<string, number>;
  };

  const aggs = new Map<string, Agg>(
    entries.map((e) => [
      e.label,
      {
        label: e.label,
        cur: 0,
        prev: 0,
        orders: 0,
        feeSum: 0,
        feeCount: 0,
        sales: 0,
        margin: 0,
        cats: new Map<string, number>(),
      },
    ]),
  );

  for (const r of currRows) {
    const label = labelOf(r.rental_company, r.category);
    const a = label ? aggs.get(label) : undefined;
    if (!a) continue;
    a.cur++;
    a.sales += r.sales ?? 0;
    a.margin += r.contribution_margin ?? 0;
    if (r.monthly_fee != null) {
      a.feeSum += r.monthly_fee;
      a.feeCount++;
    }
    const cat = r.category ?? "미분류";
    a.cats.set(cat, (a.cats.get(cat) ?? 0) + 1);
  }
  for (const r of prevRows) {
    const label = labelOf(r.rental_company, r.category);
    const a = label ? aggs.get(label) : undefined;
    if (a) a.prev++;
  }
  for (const r of currOrders) {
    const label = labelOf(r.rental_company, r.category);
    const a = label ? aggs.get(label) : undefined;
    if (a) a.orders++;
  }

  // 이번 달·전월 모두 0인 회사는 이 구간에 존재하지 않는다 — 표에서 뺀다
  const cos = Array.from(aggs.values())
    .filter((a) => a.cur > 0 || a.prev > 0)
    .sort((a, b) => b.cur - a.cur || b.prev - a.prev);

  const tot = cos.reduce((s, c) => s + c.cur, 0);
  const ptot = cos.reduce((s, c) => s + c.prev, 0);
  const totChg = ptot > 0 ? (tot / ptot - 1) * 100 : 0;
  const colorOf = (i: number) => (i < SERIES_MAX ? CAT_COLORS[i] : REST_COLOR);

  // ── 요약 문장 (전부 집계값에서 파생 — 서술은 넣지 않는다) ──
  const movers = [...cos]
    .map((c) => ({ label: c.label, diff: c.cur - c.prev }))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .slice(0, 3)
    .filter((m) => m.diff !== 0);

  const shifts = [...cos]
    .map((c) => ({
      label: c.label,
      d: pct(c.cur, tot) - pct(c.prev, ptot),
    }))
    .sort((a, b) => b.d - a.d);
  const gainer = shifts[0];
  const loser = shifts[shifts.length - 1];

  const topCatOf = (c: Agg) =>
    Array.from(c.cats.entries()).sort((a, b) => b[1] - a[1])[0] ?? null;
  const concentrated = cos.filter((c) => {
    const t = topCatOf(c);
    return t != null && c.cur > 0 && t[1] / c.cur >= 0.5;
  }).length;

  // ── 점유율 변동 차트 좌표 ──────────────────────────────
  const W = 620;
  const rowH = 28;
  const nameW = 118;
  const mid = nameW + 180;
  const chartH = shifts.length * rowH + 16;
  const maxAbs = Math.max(...shifts.map((s) => Math.abs(s.d)), 0.1);
  const scale = Math.min(60, (W - mid - 70) / maxAbs);

  // ── 카테고리 매트릭스 ─────────────────────────────────
  const catTotals = new Map<string, number>();
  for (const c of cos)
    for (const [k, v] of c.cats)
      catTotals.set(k, (catTotals.get(k) ?? 0) + v);
  const rankedCats = Array.from(catTotals.entries()).sort(
    (a, b) => b[1] - a[1],
  );
  const HM_COLS = 8;
  const mainCats = rankedCats.slice(0, HM_COLS).map((e) => e[0]);
  const restCats = rankedCats.slice(HM_COLS).map((e) => e[0]);
  const hmCols = restCats.length > 0 ? [...mainCats, "그 외"] : mainCats;
  const cellOf = (c: Agg, col: string) =>
    col === "그 외"
      ? restCats.reduce((s, k) => s + (c.cats.get(k) ?? 0), 0)
      : (c.cats.get(col) ?? 0);
  const colMax = hmCols.map((col) => Math.max(...cos.map((c) => cellOf(c, col)), 0));

  // ── 표 1위 표시 ───────────────────────────────────────
  const marginRate = (c: Agg) => (c.sales > 0 ? (c.margin / c.sales) * 100 : null);
  const certRate = (c: Agg) => (c.orders > 0 ? (c.cur / c.orders) * 100 : null);
  const avgFee = (c: Agg) => (c.feeCount > 0 ? c.feeSum / c.feeCount : null);
  const bestMargin = Math.max(
    ...cos.map((c) => marginRate(c) ?? -Infinity),
    -Infinity,
  );
  const bestCert = Math.max(
    ...cos.map((c) => certRate(c) ?? -Infinity),
    -Infinity,
  );

  const th =
    "bg-[var(--color-gray-25)] p-[9px_12px] text-right text-[11px] font-bold whitespace-nowrap text-[var(--color-gray-400)]";
  const td = "p-[9px_12px] text-right whitespace-nowrap";

  return (
    <div className="min-h-screen space-y-[24px] bg-[var(--color-page)] px-10 pt-8 pb-16">
      {/* ── 페이지 머리 ─────────────────────────────── */}
      <div>
        <div className="mb-[6px] flex items-center gap-[7px] text-[12px] text-[var(--color-gray-400)]">
          <Link
            href="/"
            className="font-semibold text-[var(--color-primary)] hover:underline"
          >
            이달의 요약
          </Link>
          <span>›</span>
          <span>그룹 요약</span>
        </div>
        <h1 className="text-[24px] font-bold tracking-[-.5px]">{group}</h1>
      </div>

      <nav className="flex flex-wrap gap-[6px]">
        {GROUP_ORDER.filter((g) =>
          COMPANY_MAP.some((c) => c.group === g),
        ).map((g) => {
          const on = g === group;
          const n = new Set(
            COMPANY_MAP.filter((c) => c.group === g).map((c) => c.label),
          ).size;
          return (
            <Link
              key={g}
              href={`/group/${encodeURIComponent(g)}`}
              aria-current={on ? "page" : undefined}
              className={`flex items-center gap-2 rounded-[8px] border px-4 py-2 text-[13px] font-bold transition-colors ${
                on
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                  : "border-[var(--color-gray-200)] bg-white text-[var(--color-gray-500)] hover:border-[var(--color-gray-400)] hover:text-[var(--color-gray-900)]"
              }`}
            >
              {g}
              <span className="num text-[11px] font-semibold opacity-75">
                {n}개사
              </span>
            </Link>
          );
        })}
      </nav>

      {/* ── 시장 요약 ───────────────────────────────── */}
      <section>
        <h2 className="mb-[11px] text-[15px] font-bold tracking-[-.3px]">
          시장 요약
        </h2>
        <div className={`${panel} overflow-hidden`}>
          <div className="grid grid-cols-1 items-start gap-[24px] p-[19px_22px_17px] lg:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <div className="mb-[9px] text-[11px] font-bold tracking-[.06em] text-[var(--color-gray-400)] uppercase">
                {month}월 {group} 시장
              </div>
              <p className="text-[19px] leading-[1.5] font-bold tracking-[-.4px] text-balance">
                시장 전체 거래건수는{" "}
                <span className="num">{nf(tot)}건</span>으로 전월 동기간 대비{" "}
                <span className="num" style={{ color: dirColor(totChg) }}>
                  {signed(totChg)}%
                </span>
                입니다.
              </p>
              <p className="mt-[10px] max-w-[62ch] text-[12px] leading-[1.7] text-[var(--color-gray-600)]">
                {movers.length > 0 && (
                  <>
                    건수 변화가 가장 큰 곳은{" "}
                    {movers.map((m, i) => (
                      <span key={m.label}>
                        {i > 0 && " · "}
                        <b className="text-[var(--color-gray-900)]">{m.label}</b>{" "}
                        <span className="num">{signedInt(m.diff)}건</span>
                      </span>
                    ))}
                    입니다.{" "}
                  </>
                )}
                {mode === "share"
                  ? gainer &&
                    loser && (
                      <>
                        점유율은{" "}
                        <b className="text-[var(--color-gray-900)]">
                          {gainer.label}
                        </b>
                        가 <span className="num">{signed(gainer.d)}%p</span>로
                        가장 많이 늘었고,{" "}
                        <b className="text-[var(--color-gray-900)]">
                          {loser.label}
                        </b>
                        가 <span className="num">{signed(loser.d)}%p</span>로
                        가장 많이 줄었습니다. 점유율 합은 항상 100%라 누군가의
                        상승은 반드시 누군가의 하락입니다.
                      </>
                    )
                  : `${cos.length}개사 중 ${concentrated}개사가 한 카테고리에 절반 이상 몰려 있어, 이 그룹은 하나의 시장으로 묶어 점유율을 따지기 어렵습니다.`}
              </p>
            </div>
            <dl className="flex gap-[22px]">
              <div className="text-right">
                <dt className="mb-[5px] text-[11px] text-[var(--color-gray-500)]">
                  그룹 전체 거래건수
                </dt>
                <dd className="num text-[22px] leading-none font-bold tracking-[-.7px]">
                  {nf(tot)}
                </dd>
                <div
                  className="num mt-[5px] text-[12px] font-bold"
                  style={{ color: dirColor(totChg) }}
                >
                  {signed(totChg)}%
                </div>
              </div>
              <div className="text-right">
                <dt className="mb-[5px] text-[11px] text-[var(--color-gray-500)]">
                  참여 렌탈사
                </dt>
                <dd className="num text-[22px] leading-none font-bold tracking-[-.7px]">
                  {cos.length}
                </dd>
                <div className="num mt-[5px] text-[12px] font-bold text-[var(--color-gray-400)]">
                  전월 동기간 {nf(ptot)}건
                </div>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* ── 점유율 이동 ─────────────────────────────── */}
      {mode === "share" && (
        <section>
          <div className="mb-[11px] flex flex-wrap items-baseline gap-[10px]">
            <h2 className="text-[15px] font-bold tracking-[-.3px]">
              점유율 이동
            </h2>
            <span className="text-[12px] text-[var(--color-gray-500)]">
              합계 100% · 전월 동기간{" "}
              {formatShortRange(prev.start, prev.end)} 대비
            </span>
          </div>
          <div className={panel}>
            <div className="px-[17px] pt-[16px] pb-[16px]">
              {[
                { title: "이번 달", total: tot, key: "cur" as const },
                { title: "전월 동기간", total: ptot, key: "prev" as const },
              ].map((band) => (
                <div key={band.key} className="mb-[14px]">
                  <div className="mb-[5px] flex items-baseline justify-between text-[11px] text-[var(--color-gray-500)]">
                    <b className="font-bold text-[var(--color-gray-600)]">
                      {band.title}
                    </b>
                    <span className="num">{nf(band.total)}건</span>
                  </div>
                  <div
                    className="flex h-[30px] gap-[2px] overflow-hidden rounded-[6px]"
                    style={{ opacity: band.key === "prev" ? 0.5 : 1 }}
                  >
                    {(() => {
                      const head = cos.slice(0, SERIES_MAX);
                      const rest = cos.slice(SERIES_MAX);
                      const segs = head.map((c, i) => ({
                        label: c.label,
                        v: c[band.key],
                        color: CAT_COLORS[i],
                      }));
                      if (rest.length > 0)
                        segs.push({
                          label: "그 외",
                          v: rest.reduce((s, c) => s + c[band.key], 0),
                          color: REST_COLOR,
                        });
                      return segs.map((s) => {
                        const p = pct(s.v, band.total);
                        return (
                          <i
                            key={s.label}
                            title={`${s.label} · ${nf(s.v)}건 · ${p.toFixed(1)}%`}
                            className="relative block h-full"
                            style={{ width: `${p}%`, background: s.color }}
                          >
                            {p > 7 && (
                              <em className="num absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white not-italic">
                                {p.toFixed(1)}%
                              </em>
                            )}
                          </i>
                        );
                      });
                    })()}
                  </div>
                </div>
              ))}

              <div className="mt-[10px] flex flex-wrap gap-x-[14px] gap-y-[4px]">
                {cos.slice(0, SERIES_MAX).map((c, i) => (
                  <span
                    key={c.label}
                    className="inline-flex items-center gap-[5px] text-[11px] text-[var(--color-gray-600)]"
                  >
                    <i
                      className="h-[9px] w-[9px] flex-none rounded-[2px]"
                      style={{ background: CAT_COLORS[i] }}
                    />
                    {c.label}
                  </span>
                ))}
                {cos.length > SERIES_MAX && (
                  <span className="inline-flex items-center gap-[5px] text-[11px] text-[var(--color-gray-600)]">
                    <i
                      className="h-[9px] w-[9px] flex-none rounded-[2px]"
                      style={{ background: REST_COLOR }}
                    />
                    그 외 {cos.length - SERIES_MAX}개사
                  </span>
                )}
              </div>

              <div className="mt-[20px]">
                <div className="mb-[9px] text-[12px] font-bold text-[var(--color-gray-600)]">
                  점유율 변동 (%p)
                </div>
                <svg
                  viewBox={`0 0 ${W} ${chartH}`}
                  width="100%"
                  height={chartH}
                  preserveAspectRatio="xMidYMid meet"
                  role="img"
                  aria-label="렌탈사별 점유율 변동"
                  style={{ display: "block", overflow: "visible" }}
                >
                  <line
                    x1={mid}
                    x2={mid}
                    y1={2}
                    y2={chartH - 14}
                    stroke="var(--color-gray-200)"
                    strokeWidth="1"
                  />
                  {shifts.map((s, i) => {
                    const y = i * rowH + 4;
                    const w = Math.max(2, Math.abs(s.d) * scale);
                    const pos = s.d >= 0;
                    const inside = w > 48;
                    return (
                      <g key={s.label}>
                        <text
                          x={nameW}
                          y={y + 14}
                          fill="var(--color-gray-600)"
                          fontSize="11.5"
                          fontWeight="600"
                          textAnchor="end"
                        >
                          {s.label}
                        </text>
                        <rect
                          x={pos ? mid + 1 : mid - w - 1}
                          y={y + 3}
                          width={w}
                          height={13}
                          rx={3}
                          fill={pos ? "var(--color-up)" : "var(--color-down)"}
                        />
                        <text
                          x={
                            pos
                              ? inside
                                ? mid + 7
                                : mid + w + 7
                              : inside
                                ? mid - 7
                                : mid - w - 7
                          }
                          y={y + 14}
                          fill={
                            inside
                              ? "#ffffff"
                              : pos
                                ? "var(--color-up)"
                                : "var(--color-down)"
                          }
                          fontSize="10.5"
                          fontWeight="700"
                          textAnchor={pos ? "start" : "end"}
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {signed(s.d)}%p
                        </text>
                      </g>
                    );
                  })}
                  <text
                    x={mid}
                    y={chartH - 2}
                    fill="var(--color-gray-400)"
                    fontSize="9.5"
                    textAnchor="middle"
                  >
                    합계는 항상 0 — 점유율은 제로섬
                  </text>
                </svg>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── 카테고리 매트릭스 ───────────────────────── */}
      {mode === "matrix" && (
        <section>
          <div className="mb-[11px] flex flex-wrap items-baseline gap-[10px]">
            <h2 className="text-[15px] font-bold tracking-[-.3px]">
              카테고리별 강점
            </h2>
            <span className="text-[12px] text-[var(--color-gray-500)]">
              렌탈사 × 카테고리 거래건수 · 이번 달
            </span>
          </div>
          <div className={panel}>
            <div className="px-[17px] pt-[16px] pb-[16px]">
              <div className="overflow-x-auto">
                <table className="min-w-[760px] border-separate border-spacing-[2px] text-[12px]">
                  <thead>
                    <tr>
                      <th />
                      {hmCols.map((c) => (
                        <th
                          key={c}
                          className="p-[5px_6px] align-bottom text-center text-[11px] font-bold whitespace-nowrap text-[var(--color-gray-500)]"
                        >
                          {c}
                        </th>
                      ))}
                      <th className="p-[5px_6px] text-center text-[11px] font-bold text-[var(--color-gray-500)]">
                        합계
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {cos.map((c) => (
                      <tr key={c.label}>
                        <th className="p-[5px_10px_5px_6px] text-left text-[11px] font-bold whitespace-nowrap">
                          <Link
                            href={`/company/${encodeURIComponent(c.label)}`}
                            className="font-bold text-[var(--color-gray-600)] hover:text-[var(--color-primary)]"
                          >
                            {c.label}
                          </Link>
                        </th>
                        {hmCols.map((col, ci) => {
                          const v = cellOf(c, col);
                          const f = colMax[ci] > 0 ? v / colMax[ci] : 0;
                          const lead = v > 0 && v === colMax[ci];
                          return (
                            <td
                              key={col}
                              title={`${c.label} · ${col} · ${nf(v)}건 (이 회사 내 ${pct(v, c.cur).toFixed(0)}%)`}
                              className="num rounded-[4px] p-[8px_6px] text-center font-semibold"
                              style={{
                                background:
                                  v === 0
                                    ? "var(--color-gray-25)"
                                    : `color-mix(in srgb, var(--color-primary) ${(8 + f * 62).toFixed(0)}%, white)`,
                                color:
                                  f > 0.55
                                    ? "#ffffff"
                                    : v === 0
                                      ? "var(--color-gray-400)"
                                      : "var(--color-gray-600)",
                                outline: lead
                                  ? "2px solid var(--color-primary)"
                                  : undefined,
                                outlineOffset: lead ? "-2px" : undefined,
                              }}
                            >
                              {v === 0 ? "–" : nf(v)}
                            </td>
                          );
                        })}
                        <td className="num rounded-[4px] p-[8px_6px] text-center font-bold">
                          {nf(c.cur)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-[12px] flex items-center gap-[8px] text-[11px] text-[var(--color-gray-500)]">
                <span>적음</span>
                <span className="flex gap-[2px]">
                  {[8, 25, 42, 58, 70].map((p) => (
                    <i
                      key={p}
                      className="h-[9px] w-[22px] rounded-[2px]"
                      style={{
                        background: `color-mix(in srgb, var(--color-primary) ${p}%, white)`,
                      }}
                    />
                  ))}
                </span>
                <span>많음</span>
                <span className="ml-[14px] font-bold text-[var(--color-primary)]">
                  ▢ 카테고리 1위
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── 렌탈사 비교 ─────────────────────────────── */}
      <section>
        <div className="mb-[11px] flex flex-wrap items-baseline gap-[10px]">
          <h2 className="text-[15px] font-bold tracking-[-.3px]">
            렌탈사 비교
          </h2>
          <span className="text-[12px] text-[var(--color-gray-500)]">
            계약완료 기준 · 전월 동기간 대비
          </span>
        </div>
        <div className={panel}>
          <div className="px-[17px] pt-[16px] pb-[16px]">
            <div className="overflow-x-auto rounded-[8px] border border-[var(--color-gray-200)]">
              <table className="w-full min-w-[860px] bg-white text-[12px]">
                <thead>
                  <tr className="border-b border-[var(--color-gray-200)]">
                    <th className={`${th} text-left`}>렌탈사</th>
                    <th className={th}>이번 달</th>
                    <th className={th}>전월 동기간</th>
                    <th className={th}>증감</th>
                    {mode === "share" ? (
                      <>
                        <th className={th}>점유율</th>
                        <th className={th}>점유율 변동</th>
                      </>
                    ) : (
                      <>
                        <th className={th}>구성비</th>
                        <th className={th}>주력 카테고리</th>
                      </>
                    )}
                    <th className={th}>평균 월렌탈료</th>
                    <th className={th}>공헌이익률</th>
                    <th className={th}>설치인증률</th>
                  </tr>
                </thead>
                <tbody>
                  {cos.map((c, i) => {
                    const diff = c.cur - c.prev;
                    const sh = pct(c.cur, tot);
                    const dsh = sh - pct(c.prev, ptot);
                    const top = topCatOf(c);
                    const mr = marginRate(c);
                    const cr = certRate(c);
                    const fee = avgFee(c);
                    return (
                      <tr
                        key={c.label}
                        className="group border-t border-[var(--color-line-2)] hover:bg-[var(--color-primary-50)]"
                      >
                        <td className={`${td} text-left`}>
                          <Link
                            href={`/company/${encodeURIComponent(c.label)}`}
                            className="flex items-center gap-[8px] font-bold text-[var(--color-gray-600)] group-hover:text-[var(--color-primary)]"
                          >
                            <i
                              className="h-[9px] w-[9px] flex-none rounded-[2px]"
                              style={{ background: colorOf(i) }}
                            />
                            {c.label}
                          </Link>
                        </td>
                        <td className={`${td} num font-bold`}>
                          {nf(c.cur)}
                        </td>
                        <td
                          className={`${td} num text-[var(--color-gray-500)]`}
                        >
                          {nf(c.prev)}
                        </td>
                        <td
                          className={`${td} num font-bold`}
                          style={{ color: dirColor(diff, 0) }}
                        >
                          {signedInt(diff)}
                        </td>
                        {mode === "share" ? (
                          <>
                            <td className={`${td} num`}>{sh.toFixed(1)}%</td>
                            <td
                              className={`${td} num font-bold`}
                              style={{ color: dirColor(dsh, 0.3) }}
                            >
                              {signed(dsh)}%p
                            </td>
                          </>
                        ) : (
                          <>
                            <td className={`${td} num`}>{sh.toFixed(1)}%</td>
                            <td className={`${td} text-[var(--color-gray-600)]`}>
                              {top ? (
                                <>
                                  {top[0]}{" "}
                                  <span className="num text-[var(--color-gray-400)]">
                                    {pct(top[1], c.cur).toFixed(0)}%
                                  </span>
                                </>
                              ) : (
                                "-"
                              )}
                            </td>
                          </>
                        )}
                        <td className={`${td} num`}>
                          {fee == null ? "-" : `${nf(fee)}원`}
                        </td>
                        <td className={`${td} num`}>
                          {mr == null ? (
                            "-"
                          ) : (
                            <>
                              {mr.toFixed(1)}%
                              {mr === bestMargin && <Best />}
                            </>
                          )}
                        </td>
                        <td className={`${td} num`}>
                          {cr == null ? (
                            "-"
                          ) : (
                            <>
                              {cr.toFixed(1)}%
                              {cr === bestCert && <Best />}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-[10px] text-[11px] text-[var(--color-gray-500)]">
              공헌이익률 = 공헌이익 ÷ 매출 · 설치인증률 = 계약완료 ÷ 주문확정
              (같은 구간) · 평균 월렌탈료는 계약완료 건의 월렌탈료 평균입니다.
            </p>
          </div>
        </div>
      </section>

      {/* ── 개별 렌탈사 이동 ────────────────────────── */}
      <details className={`${panel} overflow-hidden`}>
        <summary className="cursor-pointer list-none p-[14px_18px] text-[14px] font-bold tracking-[-.2px]">
          렌탈사별 상세로 이동
        </summary>
        <div className="flex flex-wrap gap-[8px] border-t border-[var(--color-line-2)] p-[14px_18px_20px]">
          {cos.map((c) => (
            <Link
              key={c.label}
              href={`/company/${encodeURIComponent(c.label)}`}
              className="inline-flex items-center gap-[7px] rounded-[8px] border border-[var(--color-gray-200)] bg-[var(--color-gray-100)] p-[7px_13px] text-[12px] font-semibold text-[var(--color-gray-600)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            >
              {c.label}
              <span className="num text-[10px] text-[var(--color-gray-400)]">
                {nf(c.cur)}건
              </span>
            </Link>
          ))}
        </div>
      </details>
    </div>
  );
}

/** 그룹 내 1위 — 색만으로 좋고 나쁨을 말하지 않도록 텍스트 라벨을 붙인다 */
function Best() {
  return (
    <span className="ml-[5px] rounded-[4px] bg-[var(--color-primary-50)] px-[4px] py-[1px] align-middle text-[10px] font-bold text-[var(--color-primary)]">
      1위
    </span>
  );
}
