import { createClient } from "@supabase/supabase-js";
import { RENTRE_PARTNER_NAMES, getBM } from "@/lib/company-map";
import ProductLookupClient from "./ProductLookupClient";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// raw_orders/raw_contracts는 컬럼이 많으면 6개월 기본 범위에서 50,000건 단위 조회가
// DB statement timeout에 걸릴 수 있어 더 작게 나눈다 (operation-efficiency 페이지와 동일한 이슈).
const PAGE = 10000;
const MONTHS_BACK = 6;

type RawRow = {
  category: string | null;
  brand: string | null;
  product_name: string | null;
  model_name: string | null;
  partner_company: string | null;
  total_rental_fee: number | null;
  sales_incentive: number | null;
  contribution_margin: number | null;
  management_type: string | null;
  management_cycle: string | null;
};

export type ModelOption = {
  model_name: string;
  product_name: string;
  brand: string;
  category: string;
  managementType: string;
  managementCycle: string;
  count: number;
};

export type PartnerRow = {
  partner: string;
  isRentre: boolean;
  isBM1: boolean; // true면 판매장려금 데이터 자체가 없음(0원이 아니라 데이터 없음)
  count: number;
  avgTotalRentalFee: number;
  avgIncentive: number;
  incentiveRate: number; // 이 모델 기준 판매장려금/총렌탈료 비율(%)
  avgContributionMargin: number;
  marginRate: number; // 이 모델 기준 공헌이익/총렌탈료 비율(%)
};

export type PartnerProfile = {
  partner: string;
  isRentre: boolean;
  sampleCount: number;
  avgRate: number; // 전체 가전 상품 기준 판매장려금/총렌탈료 평균 비율(%)
  stdDevRate: number;
};

function getDefaultStart(monthsBack: number): string {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - monthsBack, 1);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
}

async function fetchAllApplianceRows(start: string): Promise<RawRow[]> {
  const all: RawRow[] = [];
  for (const [table, dateCol] of [
    ["raw_orders", "order_confirmed_at"],
    ["raw_contracts", "contract_date"],
  ] as const) {
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select(
          "category, brand, product_name, model_name, partner_company, total_rental_fee, sales_incentive, contribution_margin, management_type, management_cycle",
        )
        .neq("category", "인터넷")
        .neq("category", "타이어")
        .neq("category", "유심")
        .not("model_name", "is", null)
        .not("partner_company", "is", null)
        .gte(dateCol, start)
        .range(from, from + PAGE - 1);
      if (error) throw new Error(JSON.stringify(error));
      if (!data || data.length === 0) break;
      all.push(...(data as RawRow[]));
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }
  return all;
}

function buildModelOptions(rows: RawRow[]): ModelOption[] {
  const map = new Map<string, ModelOption>();
  for (const r of rows) {
    if (!r.model_name) continue;
    const existing = map.get(r.model_name);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(r.model_name, {
        model_name: r.model_name,
        product_name: r.product_name ?? "",
        brand: r.brand ?? "",
        category: r.category ?? "",
        managementType: r.management_type ?? "",
        managementCycle: r.management_cycle ?? "",
        count: 1,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

function buildPartnerRowsForModel(rows: RawRow[], modelName: string): PartnerRow[] {
  const map = new Map<
    string,
    { count: number; feeSum: number; incentiveSum: number; marginSum: number }
  >();
  for (const r of rows) {
    if (r.model_name !== modelName || !r.partner_company) continue;
    const cur =
      map.get(r.partner_company) ?? { count: 0, feeSum: 0, incentiveSum: 0, marginSum: 0 };
    cur.count += 1;
    cur.feeSum += r.total_rental_fee ?? 0;
    cur.incentiveSum += r.sales_incentive ?? 0;
    cur.marginSum += r.contribution_margin ?? 0;
    map.set(r.partner_company, cur);
  }
  return Array.from(map.entries())
    .map(([partner, v]) => {
      const avgTotalRentalFee = Math.round(v.feeSum / v.count);
      const avgIncentive = Math.round(v.incentiveSum / v.count);
      const avgContributionMargin = Math.round(v.marginSum / v.count);
      return {
        partner,
        isRentre: RENTRE_PARTNER_NAMES.has(partner),
        isBM1: getBM(partner) === "BM1",
        count: v.count,
        avgTotalRentalFee,
        avgIncentive,
        incentiveRate: v.feeSum > 0 ? (v.incentiveSum / v.feeSum) * 100 : 0,
        avgContributionMargin,
        marginRate: v.feeSum > 0 ? (v.marginSum / v.feeSum) * 100 : 0,
      };
    })
    .sort((a, b) => b.count - a.count);
}

// 파트너사별 "판매장려금 산정 로직" 추정: 전체 가전 거래에서 건별 판매장려금/총렌탈료 비율을 모아
// 평균·표준편차를 냄. 표준편차가 작으면 일관된 정률 산식일 가능성이 높고, 크면 건마다 들쭉날쭉하다는 뜻.
function buildPartnerProfiles(rows: RawRow[], partners: string[]): Map<string, PartnerProfile> {
  const ratesByPartner = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.partner_company || !partners.includes(r.partner_company)) continue;
    if (!r.total_rental_fee || r.total_rental_fee <= 0) continue;
    const rate = ((r.sales_incentive ?? 0) / r.total_rental_fee) * 100;
    if (!ratesByPartner.has(r.partner_company)) ratesByPartner.set(r.partner_company, []);
    ratesByPartner.get(r.partner_company)!.push(rate);
  }

  const result = new Map<string, PartnerProfile>();
  for (const [partner, rates] of ratesByPartner.entries()) {
    const n = rates.length;
    const avg = rates.reduce((s, v) => s + v, 0) / n;
    const variance = rates.reduce((s, v) => s + (v - avg) ** 2, 0) / n;
    result.set(partner, {
      partner,
      isRentre: RENTRE_PARTNER_NAMES.has(partner),
      sampleCount: n,
      avgRate: avg,
      stdDevRate: Math.sqrt(variance),
    });
  }
  return result;
}

export default async function ProductLookupPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string; category?: string; brand?: string }>;
}) {
  const { model, category, brand } = await searchParams;
  const start = getDefaultStart(MONTHS_BACK);

  const rows = await fetchAllApplianceRows(start);
  const modelOptions = buildModelOptions(rows);

  const selectedModel = model && rows.some((r) => r.model_name === model) ? model : null;
  const partnerRows = selectedModel ? buildPartnerRowsForModel(rows, selectedModel) : [];
  // BM1(일반 입점 파트너사)은 렌트리가 판매장려금을 관리하지 않아 데이터가 항상 0으로 찍힘 —
  // "산정 로직 추정"은 BM2/BM3(렌트리 관리 채널)에만 의미가 있음
  const partnerProfiles = selectedModel
    ? buildPartnerProfiles(
        rows,
        partnerRows.filter((p) => !p.isBM1).map((p) => p.partner),
      )
    : new Map<string, PartnerProfile>();

  const selectedInfo = selectedModel
    ? modelOptions.find((m) => m.model_name === selectedModel) ?? null
    : null;

  return (
    <div className="px-12 py-6 mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#222222]">상품 지원금 조회</h1>
        <p className="text-sm text-[#788093] mt-1">
          동일 모델을 판매한 파트너사별 판매장려금(지원금)을 비교하고, 파트너사별 산정 로직을
          추정합니다 (가전, 최근 6개월 실거래 기준)
          <br />
          가전 전체 거래의 판매장려금/총렌탈료 비율 평균과 표준편차로 정률 산식 여부를
          추정하며, 표준편차가 작을수록 일관된 정률 산식일 가능성이 높습니다
        </p>
      </div>
      <ProductLookupClient
        modelOptions={modelOptions}
        selectedModel={selectedModel}
        selectedInfo={selectedInfo}
        partnerRows={partnerRows}
        partnerProfiles={Array.from(partnerProfiles.values())}
        initialCategory={category ?? ""}
        initialBrand={brand ?? ""}
      />
    </div>
  );
}
