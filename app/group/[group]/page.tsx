import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { COMPANY_MAP, dbNamesOf, matchesEntry } from "@/lib/company-map";
import { getPeriod, getDataAsOf, formatShortRange } from "@/lib/period";
import { deltaColor as dirColor } from "@/app/components/home/cardKit";
import { EOK } from "@/lib/format";
import { CANCELLED_STATUS } from "@/lib/conversion";
import Delta from "@/app/components/Delta";

// 크론(revalidatePath)이 실제 무효화를 담당하고,
// 이 값은 크론이 실패해도 캐시가 영구히 얼지 않게 하는 안전망이다.
export const revalidate = 86400;

// 사이드바 노출 순서와 같게 고정한다 (COMPANY_MAP 선언 순서는 가전&상조가 먼저다)
const GROUP_ORDER = ["정수기", "가전&상조", "통신"];

// 정수기·통신은 같은 상품을 두고 정면 경쟁이라 "점유율 = 제로섬" 축이 성립한다.
// 가전&상조는 회사마다 주력 카테고리가 달라 한 시장이 아니다.
// 두 모듈은 세 그룹 모두 세우되(어느 렌탈사든 양쪽 뷰를 갖는다), 이 판단은 버리지 않고
// "같은 수치를 뭐라고 부를 것인가"를 고르는 데 쓴다 — 한 시장이 아닌 그룹의 수치를
// "시장 점유율"이라 부르면 거짓이 된다.
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
  /** 거래액 — 홈·/companies 의 KPI 와 같은 컬럼을 쓴다. monthly_fee(월 렌탈료)와 다르다 */
  gmv: number | null;
  contribution_margin: number | null;
  sales: number | null;
};

type OrderRow = {
  rental_company: string | null;
  category: string | null;
  /** 취소 판별 — 설치인증률 분모를 순주문확정으로 내린다 */
  status: string | null;
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
      .from("raw_prop_items")
      .select(
        "rental_company, category, monthly_fee, gmv, contribution_margin, sales",
      )
      .not("contract_date", "is", null)
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
      .from("raw_prop_items")
      .select("rental_company, category, status")
      .not("order_confirmed_at", "is", null)
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

/**
 * 히트맵 농도를 5단으로 접는다.
 *
 * 연속 그라데이션(color-mix)은 셀끼리 미세하게만 달라서 "어느 쪽이 진한가"를
 * 눈으로 못 가른다. 단을 끊으면 같은 단끼리 묶여 읽히고, 범례의 5칸과도 일대일로 맞는다.
 * 램프 자체는 --ramp-1..5 로 브랜드색과 분리돼 있어 브랜드색을 바꿔도 판독 기준이 안 흔들린다.
 */
function rampStep(f: number): 1 | 2 | 3 | 4 | 5 {
  if (f >= 0.8) return 5;
  if (f >= 0.6) return 4;
  if (f >= 0.4) return 3;
  if (f >= 0.2) return 2;
  return 1;
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
  const { curr, prev, month } = getPeriod(await getDataAsOf());
  const dbNames = Array.from(new Set(entries.flatMap(dbNamesOf)));

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
      if (!dbNamesOf(e).includes(dbName)) continue;
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
    /** 취소 — 분모에서 뺀다 */
    cancels: number;
    feeSum: number;
    feeCount: number;
    amount: number;
    sales: number;
    margin: number;
    /** 전월 동기간 금액 — KPI 타일의 비교값. 건수(prev)만으로는 타일을 못 세운다 */
    prevAmount: number;
    prevSales: number;
    prevMargin: number;
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
        cancels: 0,
        feeSum: 0,
        feeCount: 0,
        amount: 0,
        sales: 0,
        margin: 0,
        prevAmount: 0,
        prevSales: 0,
        prevMargin: 0,
        cats: new Map<string, number>(),
      },
    ]),
  );

  for (const r of currRows) {
    const label = labelOf(r.rental_company, r.category);
    const a = label ? aggs.get(label) : undefined;
    if (!a) continue;
    a.cur++;
    a.amount += r.gmv ?? 0;
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
    if (!a) continue;
    a.prev++;
    a.prevAmount += r.gmv ?? 0;
    a.prevSales += r.sales ?? 0;
    a.prevMargin += r.contribution_margin ?? 0;
  }
  for (const r of currOrders) {
    const label = labelOf(r.rental_company, r.category);
    const a = label ? aggs.get(label) : undefined;
    if (!a) continue;
    a.orders++;
    if (r.status === CANCELLED_STATUS) a.cancels++;
  }

  // 이번 달·전월 모두 0인 회사는 이 구간에 존재하지 않는다 — 표에서 뺀다
  const cos = Array.from(aggs.values())
    .filter((a) => a.cur > 0 || a.prev > 0)
    .sort((a, b) => b.cur - a.cur || b.prev - a.prev);

  const tot = cos.reduce((s, c) => s + c.cur, 0);
  const ptot = cos.reduce((s, c) => s + c.prev, 0);
  const totChg = ptot > 0 ? (tot / ptot - 1) * 100 : 0;
  const colorOf = (i: number) => (i < SERIES_MAX ? CAT_COLORS[i] : REST_COLOR);

  // ── KPI 4타일 — 홈과 같은 지표·같은 산식 ────────────────
  const sumOf = (f: (c: Agg) => number) => cos.reduce((s, c) => s + f(c), 0);
  // 분모가 0이면 증감률이 성립하지 않는다 — 0%가 아니라 null(—)이다
  const chgOf = (cur: number, prv: number) =>
    prv !== 0 ? (cur / prv - 1) * 100 : null;
  const amtCur = sumOf((c) => c.amount) / EOK;
  const amtPrv = sumOf((c) => c.prevAmount) / EOK;
  const salesCur = sumOf((c) => c.sales) / EOK;
  const salesPrv = sumOf((c) => c.prevSales) / EOK;
  // 공헌이익은 총액이 아니라 건당으로 비교한다 — 홈과 같은 규칙
  const cpuCur = tot > 0 ? sumOf((c) => c.margin) / tot : 0;
  const cpuPrv = ptot > 0 ? sumOf((c) => c.prevMargin) / ptot : 0;
  const manwon = (v: number) =>
    Math.abs(v) >= 10000
      ? `${(v / 10000).toLocaleString("ko-KR", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })}만원`
      : `${Math.round(v).toLocaleString("ko-KR")}원`;

  // 순위 변동 — 전월 건수 기준 순위와 비교. 이미 가진 값이라 조회가 안 늘어난다.
  const prevRank = new Map<string, number>();
  [...cos]
    .sort((a, b) => b.prev - a.prev)
    .forEach((c, i) => prevRank.set(c.label, i + 1));

  // 가전&상조는 회사마다 주력 카테고리가 달라 한 시장이 아니다 —
  // 같은 수치를 "점유율"이라 부르면 거짓이 되므로 말만 바꾼다.
  const shareWord = mode === "share" ? "점유율" : "그룹 내 비중";

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
    for (const [k, v] of c.cats) catTotals.set(k, (catTotals.get(k) ?? 0) + v);
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
  const colMax = hmCols.map((col) =>
    Math.max(...cos.map((c) => cellOf(c, col)), 0),
  );

  // ── 표 1위 표시 ───────────────────────────────────────
  const marginRate = (c: Agg) =>
    c.sales > 0 ? (c.margin / c.sales) * 100 : null;
  // 설치인증률 분모는 순주문확정(주문확정 − 취소) — DW net_order_confirmed 정합
  const certRate = (c: Agg) => {
    const net = c.orders - c.cancels;
    return net > 0 ? (c.cur / net) * 100 : null;
  };
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
      {/* 제목·경로는 상단 헤더(Header.tsx)가 담당한다 — /companies 와 같은 규칙.
          아래 그룹 탭은 사이드바와 겹치지만 남긴다: 768px 미만에서 사이드바가
          숨으므로 모바일에선 이게 유일한 그룹 이동 수단이다. */}
      <nav className="flex flex-wrap gap-[6px]">
        {GROUP_ORDER.filter((g) => COMPANY_MAP.some((c) => c.group === g)).map(
          (g) => {
            const on = g === group;
            const n = new Set(
              COMPANY_MAP.filter((c) => c.group === g).map((c) => c.label),
            ).size;
            return (
              <Link
                key={g}
                href={`/group/${encodeURIComponent(g)}`}
                aria-current={on ? "page" : undefined}
                className={`press flex items-center gap-2 rounded-[8px] border px-4 py-2 text-[13px] font-bold transition-colors ${
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
          },
        )}
      </nav>

      {/* ── 시장 요약 ───────────────────────────────── */}
      <section>
        <h2 className="mb-[11px] text-[15px] font-bold tracking-[-.3px]">
          시장 요약
        </h2>
        <div className={`${panel} overflow-hidden`}>
          {/* KPI 4타일 — 홈과 같은 지표·같은 산식(거래액·매출은 억, 공헌이익은 건당).
              한 타일 = 지금 값 · 전월 동기간 값 · 증감률.
              홈에 있는 12개월 스파크라인은 여기 없다 — 이 페이지는 이번 달·전월
              두 구간만 조회하므로 추이선을 붙이려면 12개월 조회가 하나 더 붙는다. */}
          <dl className="grid grid-cols-2 gap-px bg-[var(--color-line-2)] lg:grid-cols-4">
            {[
              {
                label: "계약완료",
                value: nf(tot),
                unit: "건",
                prev: `${nf(ptot)}건`,
                delta: chgOf(tot, ptot),
                negative: false,
              },
              {
                label: "거래액",
                value: amtCur.toFixed(1),
                unit: "억",
                prev: `${amtPrv.toFixed(1)}억`,
                delta: chgOf(amtCur, amtPrv),
                negative: false,
              },
              {
                label: "매출",
                value: salesCur.toFixed(1),
                unit: "억",
                prev: `${salesPrv.toFixed(1)}억`,
                delta: chgOf(salesCur, salesPrv),
                negative: false,
              },
              {
                label: "건당 공헌이익",
                value:
                  Math.abs(cpuCur) >= 10000
                    ? (cpuCur / 10000).toLocaleString("ko-KR", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })
                    : Math.round(cpuCur).toLocaleString("ko-KR"),
                unit: Math.abs(cpuCur) >= 10000 ? "만원" : "원",
                prev: manwon(cpuPrv),
                delta: chgOf(cpuCur, cpuPrv),
                // 값의 좋고 나쁨은 방향색이 아니라 텍스트 라벨로 말한다
                negative: cpuCur < 0,
              },
            ].map((k) => (
              <div key={k.label} className="bg-white p-[13px_15px_11px]">
                <dt className="mb-[5px] flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-gray-500)]">
                  {k.label}
                  {k.negative && (
                    <span
                      className="rounded-[4px] px-1.5 py-px text-[10px] font-bold"
                      style={{
                        color: "var(--color-sev-crit)",
                        background: "var(--color-sev-crit-100)",
                      }}
                    >
                      적자
                    </span>
                  )}
                </dt>
                <dd className="flex items-end justify-between gap-2">
                  <div className="num text-[24px] leading-[28px] font-bold tracking-[-.6px]">
                    {k.value}
                    <i className="ml-0.5 text-[12px] font-semibold tracking-normal text-[var(--color-gray-500)] not-italic">
                      {k.unit}
                    </i>
                  </div>
                  {/* 증감률 위에 비교 대상값을 붙인다 — "몇 %"만 있으면
                      무엇에서 무엇으로 갔는지가 화면에서 사라진다 */}
                  <div className="text-right whitespace-nowrap">
                    <div className="text-[12px] font-bold">
                      <Delta value={k.delta} />
                    </div>
                    <div className="num mt-px text-[10px] text-[var(--color-gray-400)]">
                      전월 동기간 {k.prev}
                    </div>
                  </div>
                </dd>
              </div>
            ))}
          </dl>

          {/* 자동 생성 요약문 — 전부 집계값에서 파생된다(서술은 넣지 않는다) */}
          <div className="border-t border-[var(--color-gray-200)] p-[16px_22px_18px]">
            <div className="mb-[9px] text-[11px] font-bold tracking-[.06em] text-[var(--color-gray-400)] uppercase">
              {month}월 {group} 시장
            </div>
            <p className="text-xl leading-[28px] font-semibold tracking-[-.4px] text-balance">
              시장 전체 계약완료는 <span className="num">{nf(tot)}건</span>으로
              전월 동기간 대비{" "}
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
                      <b className="text-[var(--color-gray-900)]">
                        {m.label}
                      </b>{" "}
                      <span className="num">{signedInt(m.diff)}건</span>
                    </span>
                  ))}
                  입니다.{" "}
                </>
              )}
              {gainer && loser && (
                <>
                  {shareWord}은{" "}
                  <b className="text-[var(--color-gray-900)]">{gainer.label}</b>
                  가 <span className="num">{signed(gainer.d)}%p</span>로 가장
                  많이 늘었고,{" "}
                  <b className="text-[var(--color-gray-900)]">{loser.label}</b>
                  가 <span className="num">{signed(loser.d)}%p</span>로 가장
                  많이 줄었습니다.{" "}
                  {mode === "share"
                    ? "점유율 합은 항상 100%라 누군가의 상승은 반드시 누군가의 하락입니다."
                    : `다만 ${cos.length}개사 중 ${concentrated}개사가 한 카테고리에 절반 이상 몰려 있어, 이 그룹은 하나의 시장으로 묶어 점유율을 따지기 어렵습니다 — 위 수치는 시장 점유율이 아니라 그룹 안에서의 비중입니다.`}
                </>
              )}
            </p>
          </div>
        </div>
      </section>

      {/* ── 점유율 이동 — 세 그룹 모두 세운다. 한 시장이 아닌 그룹에서는
             같은 수치를 "그룹 내 비중"이라 부른다(shareWord). ────────── */}
      <section>
        <div className="mb-[11px] flex flex-wrap items-baseline gap-[10px]">
          <h2 className="text-[15px] font-bold tracking-[-.3px]">
            {shareWord} 이동
          </h2>
          <span className="text-[12px] text-[var(--color-gray-500)]">
            {mode === "share"
              ? `합계 100% · 전월 동기간 ${formatShortRange(prev.start, prev.end)} 대비`
              : `합계 100% · 한 시장이 아니라 그룹 안에서의 비중입니다 — ${cos.length}개사 중 ${concentrated}개사가 한 카테고리에 절반 이상 몰려 있습니다`}
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
                {shareWord} 변동 (%p)
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
                  {mode === "share"
                    ? "합계는 항상 0 — 점유율은 제로섬"
                    : "합계는 항상 0 — 그룹 안에서의 자리바꿈"}
                </text>
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* ── 카테고리별 강점 — 세 그룹 모두 세운다 ───── */}
      <section>
        <div className="mb-[11px] flex flex-wrap items-baseline gap-[10px]">
          <h2 className="text-[15px] font-bold tracking-[-.3px]">
            카테고리별 강점
          </h2>
          <span className="text-[12px] text-[var(--color-gray-500)]">
            렌탈사 × 카테고리 계약완료 · 이번 달
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
                                  : `var(--ramp-${rampStep(f)})`,
                              color:
                                v === 0
                                  ? "var(--color-gray-400)"
                                  : rampStep(f) === 5
                                    ? "#ffffff"
                                    : "var(--color-gray-900)",
                              // lead 는 v === colMax 라 항상 f === 1, 즉 항상 ramp-5(가장 진한 단)다.
                              // 브랜드 인디고로 테를 두르면 ramp-5 와 대비 1.03 이라 보이지 않는다.
                              // 흰 테는 대비 7.71 로 확실히 읽힌다.
                              outline: lead ? "2px solid #ffffff" : undefined,
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
                {[1, 2, 3, 4, 5].map((step) => (
                  <i
                    key={step}
                    className="h-[9px] w-[22px] rounded-[2px]"
                    style={{ background: `var(--ramp-${step})` }}
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
            {/* 넓은 표는 페이지가 아니라 표 자체가 가로 스크롤한다 — 첫 열은 sticky */}
            <div className="overflow-x-auto rounded-[8px] border border-[var(--color-gray-200)]">
              <table className="w-full min-w-[1040px] bg-white text-[12px]">
                <thead>
                  <tr className="border-b border-[var(--color-gray-200)]">
                    <th className={`${th} sticky left-0 z-[1] text-left`}>
                      렌탈사
                    </th>
                    <th className={th}>이번 달</th>
                    <th className={th}>등락률</th>
                    <th className={th}>전월 동기간</th>
                    <th className={`${th} text-left`}>{shareWord}</th>
                    <th className={th}>{shareWord} 변동</th>
                    <th className={`${th} text-left`}>주력 카테고리</th>
                    <th className={th}>평균 월렌탈료</th>
                    <th className={th}>공헌이익률</th>
                    <th className={th}>계약완료율</th>
                  </tr>
                </thead>
                <tbody>
                  {cos.map((c, i) => {
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
                        {/* 순위·이름은 한 칸에 묶어 sticky 로 고정한다 —
                            가로로 스크롤해도 어느 렌탈사 행인지 잃지 않는다 */}
                        <td
                          className={`${td} sticky left-0 z-[1] bg-white text-left group-hover:bg-[var(--color-primary-50)]`}
                        >
                          <div className="flex items-center gap-[8px]">
                            <span className="num w-[14px] flex-none text-right text-[11px] font-bold text-[var(--color-gray-400)]">
                              {i + 1}
                            </span>
                            <RankMove
                              from={prevRank.get(c.label)}
                              to={i + 1}
                              isNew={c.prev === 0}
                            />
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
                          </div>
                        </td>
                        <td className={`${td} num font-bold`}>{nf(c.cur)}</td>
                        <td className={`${td} font-bold`}>
                          <Delta value={chgOf(c.cur, c.prev)} />
                        </td>
                        <td
                          className={`${td} num text-[var(--color-gray-500)]`}
                        >
                          {nf(c.prev)}
                        </td>
                        {/* 비중 바는 순서·크기 지표라 카테고리 팔레트를 쓰지 않는다 */}
                        <td className={`${td} text-left`}>
                          <div className="flex items-center gap-[8px]">
                            <span className="h-[6px] w-[64px] flex-none overflow-hidden rounded-[4px] bg-[var(--color-gray-200)]">
                              <i
                                className="block h-full rounded-[4px]"
                                style={{
                                  width: `${sh}%`,
                                  background: "var(--color-primary-400)",
                                }}
                              />
                            </span>
                            <span className="num text-[var(--color-gray-600)]">
                              {sh.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td
                          className={`${td} num font-bold`}
                          style={{ color: dirColor(dsh, 0.3) }}
                        >
                          {signed(dsh)}%p
                        </td>
                        <td className={`${td} text-left`}>
                          {top ? (
                            <span className="inline-flex items-center gap-[5px] rounded-[9999px] bg-[var(--color-gray-100)] px-[9px] py-[3px] text-[11px] font-semibold whitespace-nowrap text-[var(--color-gray-600)]">
                              {top[0]}
                              <span className="num text-[10px] text-[var(--color-gray-400)]">
                                {pct(top[1], c.cur).toFixed(0)}%
                              </span>
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className={`${td} num`}>
                          {fee == null ? "-" : `${nf(fee)}원`}
                        </td>
                        <td className={`${td} num`}>
                          {mr == null ? (
                            "-"
                          ) : (
                            <>
                              {mr.toFixed(1)}%{mr === bestMargin && <Best />}
                            </>
                          )}
                        </td>
                        <td className={`${td} num`}>
                          {cr == null ? (
                            "-"
                          ) : (
                            <>
                              {cr.toFixed(1)}%{cr === bestCert && <Best />}
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
              공헌이익률 = 공헌이익 ÷ 매출 · 계약완료율 = 계약완료 ÷ 순주문확정(주문확정 − 취소)
              (같은 구간, 취소 제외) · 평균 월렌탈료는 계약완료 건의 월렌탈료 평균입니다.
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

/**
 * 순위 변동 — 전월 건수 순위 대비. 스파크라인을 세우지 않았으므로
 * "추이"는 등락률과 이 열 둘이 진다.
 * 색만으로 말하지 않도록 ▲▼ 글리프와 숫자를 함께 붙인다.
 */
function RankMove({
  from,
  to,
  isNew,
}: {
  from?: number;
  to: number;
  isNew: boolean;
}) {
  if (isNew || from == null)
    return (
      <span className="rounded-[4px] bg-[var(--color-primary-50)] px-[4px] py-px text-[9px] font-bold text-[var(--color-primary)]">
        NEW
      </span>
    );
  const move = from - to;
  if (move === 0)
    return <span className="text-[10px] text-[var(--color-gray-250)]">—</span>;
  return (
    <span
      className="num text-[10px] font-bold"
      style={{
        color: move > 0 ? "var(--color-up)" : "var(--color-down)",
      }}
    >
      {move > 0 ? "▲" : "▼"}
      {Math.abs(move)}
    </span>
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
