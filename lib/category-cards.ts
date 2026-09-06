/**
 * 세부 카테고리 카드 빌드 — /categories(전체 카테고리)와 /categories/[축]이
 * 같은 정의를 쓴다. 카드 판정(평소 페이스·순위)이 두 화면에서 갈라지면
 * 같은 카테고리가 화면마다 다른 상태로 보이므로 여기 하나만 둔다.
 */
import { catGroupOf } from "@/lib/biz-category";
import {
  companyLabelOf,
  perDeal,
  type CardContractRow,
} from "@/lib/company-cards";
import type { CategoryCard } from "@/app/components/home/CategoryCards";

const EOK = 100_000_000;

/**
 * @param windowRows 최근 12개월 계약완료 행 (필요한 범위로 이미 필터된 상태)
 * @param recentYms  windowRows를 자를 12개월 "YYYY-MM" 목록 (과거→현재)
 * @param dayCut     매월 1~dayCut일만 센다 — 진행 중인 달과 공정하게 비교
 * @param catKeyOf   행 → 세부 카테고리 키 (미매핑은 "그 외"로 흡수)
 * @param catKeys    카드 목록·순서
 */
export function buildCategoryCards<T extends CardContractRow>({
  windowRows,
  currRows,
  prevRows,
  recentYms,
  dayCut,
  catKeyOf,
  catKeys,
}: {
  windowRows: T[];
  currRows: T[];
  prevRows: T[];
  recentYms: string[];
  dayCut: number;
  catKeyOf: (r: T) => string;
  catKeys: string[];
}): CategoryCard[] {
  const catSalesWindow = new Map<string, Map<string, number>>();
  for (const r of windowRows) {
    if (Number(r.contract_date.slice(8, 10)) > dayCut) continue;
    const k = catKeyOf(r);
    const ym = r.contract_date.slice(0, 7);
    if (!catSalesWindow.has(k)) catSalesWindow.set(k, new Map());
    const wm = catSalesWindow.get(k)!;
    wm.set(ym, (wm.get(ym) ?? 0) + (r.sales ?? 0));
  }
  type CatAcc = {
    count: number;
    sales: number;
    amount: number;
    margin: number;
    companies: Map<string, number>;
  };
  const emptyAcc = (): CatAcc => ({
    count: 0,
    sales: 0,
    amount: 0,
    margin: 0,
    companies: new Map(),
  });
  const accBy = (rows: T[], withCompanies: boolean) => {
    const m = new Map<string, CatAcc>();
    for (const r of rows) {
      const k = catKeyOf(r);
      if (!m.has(k)) m.set(k, emptyAcc());
      const a = m.get(k)!;
      a.count += 1;
      a.sales += r.sales ?? 0;
      a.amount += r.total_rental_fee ?? 0;
      a.margin += r.contribution_margin ?? 0;
      if (withCompanies) {
        const label = companyLabelOf(r);
        a.companies.set(label, (a.companies.get(label) ?? 0) + 1);
      }
    }
    return m;
  };
  const catCurrAcc = accBy(currRows, true);
  const catPrevAcc = accBy(prevRows, false);

  const categoryCards: CategoryCard[] = catKeys.map((k) => {
    const c = catCurrAcc.get(k) ?? emptyAcc();
    const p = catPrevAcc.get(k) ?? emptyAcc();
    const paceVals = recentYms
      .slice(-4, -1)
      .map((ym) => (catSalesWindow.get(k)?.get(ym) ?? 0) / EOK);
    const pace = paceVals.length
      ? paceVals.reduce((s, v) => s + v, 0) / paceVals.length
      : 0;
    const topCompany = Array.from(c.companies.entries()).sort(
      (a, b) => b[1] - a[1],
    )[0];
    return {
      label: k,
      // 카드의 그룹 = 카테고리 그룹(6그룹) — 카드 그리드의 필터 축이 된다
      group: k === "그 외" ? "기타" : catGroupOf(k),
      sales: c.sales / EOK,
      salesPrev: p.sales / EOK,
      pace,
      count: c.count,
      countPrev: p.count,
      amount: c.amount / EOK,
      cpu: perDeal(c.margin, c.count),
      topCompany: topCompany?.[0] ?? "-",
      topShare: c.count > 0 ? ((topCompany?.[1] ?? 0) / c.count) * 100 : 0,
      rank: 0,
      prevRank: 0,
      spark: recentYms.map((ym) => (catSalesWindow.get(k)?.get(ym) ?? 0) / EOK),
    };
  });
  [...categoryCards]
    .sort((a, b) => b.sales - a.sales)
    .forEach((c, i) => (c.rank = i + 1));
  [...categoryCards]
    .sort((a, b) => b.salesPrev - a.salesPrev)
    .forEach((c, i) => (c.prevRank = i + 1));

  return categoryCards;
}
