/**
 * 렌탈사 요약 카드 빌드 — 홈(기여 Top 요약)과 /companies(전체 렌탈사)가
 * 같은 정의를 쓴다. 카드 판정(평소 페이스·순위)이 두 화면에서 갈라지면
 * 같은 렌탈사가 화면마다 다른 상태로 보이므로 여기 하나만 둔다.
 */
import { COMPANY_MAP, getBM } from "@/lib/company-map";
import type { CompanyCard } from "@/app/components/home/CompanyCards";

export type CardContractRow = {
  contract_date: string;
  rental_company: string | null;
  category: string | null;
  partner_company: string | null;
  total_rental_fee: number | null;
  contribution_margin: number | null;
  sales: number | null;
};

const EOK = 100_000_000;

/** 그룹 필터 노출 순서 */
export const CARD_GROUP_ORDER = ["정수기", "가전&상조", "통신"];

export const CARD_DEFS = COMPANY_MAP.map((c) => ({
  label: c.label,
  dbName: c.dbName,
  group: c.group,
  categoryIs: c.categoryIs,
  categoryNot: c.categoryNot,
}));
export type CardDef = (typeof CARD_DEFS)[number];

const asArr = (v?: string | string[]) =>
  v === undefined ? null : Array.isArray(v) ? v : [v];

// COMPANY_MAP의 카테고리 조건까지 반영한다 — dbName만으로 나누면
// LG 하나가 'LG_가전'과 'LG_가전구독' 양쪽에 섞인다.
export function matchesCompany(
  def: CardDef,
  r: { rental_company: string | null; category: string | null },
) {
  if (r.rental_company !== def.dbName) return false;
  const cat = r.category ?? "";
  const is = asArr(def.categoryIs);
  if (is && !is.includes(cat)) return false;
  const not = asArr(def.categoryNot);
  if (not && not.includes(cat)) return false;
  return true;
}

export function companyLabelOf(r: {
  rental_company: string | null;
  category: string | null;
}): string {
  return (
    CARD_DEFS.find((d) => matchesCompany(d, r))?.label ??
    r.rental_company ??
    "-"
  );
}

/** 건당 공헌이익 — 비율보다 "한 건 팔면 얼마 남나"가 직관적이다 */
export function perDeal(margin: number, count: number) {
  return count > 0 ? margin / count : 0;
}

/**
 * @param windowRows 최근 12개월 계약완료 행 — 스파크라인·평소 페이스용
 * @param recentYms  windowRows를 자를 12개월 "YYYY-MM" 목록 (과거→현재)
 * @param dayCut     매월 1~dayCut일만 센다 — 진행 중인 달과 공정하게 비교
 */
export function buildCompanyCards({
  currContracts,
  prevContracts,
  windowRows,
  recentYms,
  dayCut,
}: {
  currContracts: CardContractRow[];
  prevContracts: CardContractRow[];
  windowRows: CardContractRow[];
  recentYms: string[];
  dayCut: number;
}): CompanyCard[] {
  // 렌탈사 × 월 카운트 — 1~dayCut일 창 (스파크라인·평소 페이스 공용)
  const rcWindow = new Map<string, Map<string, number>>();
  for (const r of windowRows) {
    const def = CARD_DEFS.find((d) => matchesCompany(d, r));
    if (!def) continue;
    const ym = r.contract_date.slice(0, 7);
    if (Number(r.contract_date.slice(8, 10)) <= dayCut) {
      if (!rcWindow.has(def.label)) rcWindow.set(def.label, new Map());
      const wm = rcWindow.get(def.label)!;
      wm.set(ym, (wm.get(ym) ?? 0) + 1);
    }
  }

  const cards = CARD_DEFS.map((def) => {
    const cRows = currContracts.filter((r) => matchesCompany(def, r));
    const pRows = prevContracts.filter((r) => matchesCompany(def, r));

    // 평소 페이스 = 직전 3개월의 같은 기간(1~dayCut일) 평균
    const paceMonths = recentYms.slice(-4, -1);
    const paceVals = paceMonths.map(
      (ym) => rcWindow.get(def.label)?.get(ym) ?? 0,
    );
    const pace = paceVals.length
      ? paceVals.reduce((s, v) => s + v, 0) / paceVals.length
      : 0;

    const catCount = new Map<string, number>();
    const bmCount = { BM1: 0, BM2: 0, BM3: 0 };
    let sales = 0;
    let margin = 0;
    let revenue = 0;
    for (const r of cRows) {
      const c = r.category ?? "기타";
      catCount.set(c, (catCount.get(c) ?? 0) + 1);
      bmCount[getBM(r.partner_company)] += 1;
      sales += r.sales ?? 0;
      margin += r.contribution_margin ?? 0;
      revenue += r.total_rental_fee ?? 0;
    }
    // 전월 매출은 "매출 급증/급감" 신호를 만들기 위해서만 쌓는다
    let salesPrevSum = 0;
    for (const r of pRows) salesPrevSum += r.sales ?? 0;

    const topCats = Array.from(catCount.entries()).sort((a, b) => b[1] - a[1]);
    const total = cRows.length || 1;

    return {
      label: def.label,
      bm: (Object.entries(bmCount).sort((a, b) => b[1] - a[1])[0]?.[0] ??
        "BM1") as string,
      group: def.group,
      curr: cRows.length,
      prev: pRows.length,
      pace,
      amount: revenue / EOK,
      sales: sales / EOK,
      salesPrev: salesPrevSum / EOK,
      cpu: perDeal(margin, cRows.length),
      topCategory: topCats[0]?.[0] ?? "-",
      topShare: ((topCats[0]?.[1] ?? 0) / total) * 100,
      rank: 0,
      prevRank: 0,
      // 카드 스파크라인도 매월 같은 기간 기준 — 마지막 점만 반 달치면 추세가 왜곡된다
      spark: recentYms.map((ym) => rcWindow.get(def.label)?.get(ym) ?? 0),
      heat: Array.from(
        { length: 5 },
        (_, i) => ((topCats[i]?.[1] ?? 0) / total) * 100,
      ),
    };
  });

  // 순위는 이번 달·전월 각각의 거래건수 기준
  [...cards].sort((a, b) => b.curr - a.curr).forEach((c, i) => (c.rank = i + 1));
  [...cards]
    .sort((a, b) => b.prev - a.prev)
    .forEach((c, i) => (c.prevRank = i + 1));

  return cards;
}

/** 직전 90일 계약완료(≒설치인증) 건수 — 렌탈사 티어 폴백 산정용 */
export function countInstall90d(
  rows: CardContractRow[],
  end: string,
): Map<string, number> {
  const d = new Date(`${end}T00:00:00`);
  d.setDate(d.getDate() - 89);
  const p = (v: number) => String(v).padStart(2, "0");
  const start = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;

  const out = new Map<string, number>();
  for (const r of rows) {
    if (r.contract_date < start || r.contract_date > end) continue;
    const def = CARD_DEFS.find((dd) => matchesCompany(dd, r));
    if (!def) continue;
    out.set(def.label, (out.get(def.label) ?? 0) + 1);
  }
  return out;
}
