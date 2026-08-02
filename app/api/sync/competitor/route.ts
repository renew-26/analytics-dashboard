import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchRedashData } from "@/lib/redash";
import { REDASH_QUERY } from "@/lib/redash";
import { buildCompetitorRecordFromAppliance, ProductLookup, CompetitorSubsidyInsert } from "@/lib/tps/competitorSync";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PAGE_SIZE = 1000;

async function fetchAllActiveApplianceProducts() {
  const rows = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("products")
      .select("id, model_number, name, brand, contract_period")
      .eq("category", "appliance")
      .eq("is_active", true)
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function POST() {
  try {
    const rows = await fetchRedashData(REDASH_QUERY.APPLIANCE_COMPETITOR) as Record<string, unknown>[];

    if (rows.length === 0) {
      return NextResponse.json({ error: "Redash 데이터를 가져오지 못했습니다." }, { status: 502 });
    }

    const productsRaw = await fetchAllActiveApplianceProducts();

    const products: ProductLookup[] = productsRaw.map(p => ({
      id: p.id,
      modelNumber: p.model_number,
      name: p.name,
      brand: p.brand,
      contractPeriod: p.contract_period,
    }));

    const now = new Date();
    const surveyYear = now.getFullYear();
    const surveyMonth = now.getMonth() + 1;

    const records: CompetitorSubsidyInsert[] = [];
    let matched = 0;
    let unmatched = 0;

    for (const row of rows) {
      if (row["지원금"] === null || row["지원금"] === undefined) continue;
      const { record, matched: isMatched } = buildCompetitorRecordFromAppliance(row, products, surveyYear, surveyMonth);
      if (isMatched && record) {
        records.push(record);
        matched += 1;
      } else {
        unmatched += 1;
      }
    }

    // Redash는 견적(거래) 단위 로우를 반환하므로 같은 상품×경쟁사×조사월에 여러 건이 있을 수 있다.
    // competitor_subsidies의 유니크 제약(product_id, partner_name, survey_year, survey_month)을
    // 만족시키기 위해 평균 지원금으로 합쳐서 한 행으로 upsert한다.
    const grouped = new Map<string, { record: CompetitorSubsidyInsert; subsidySum: number; count: number }>();
    for (const record of records) {
      const key = `${record.product_id}::${record.partner_name}::${record.survey_year}::${record.survey_month}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.subsidySum += record.subsidy;
        existing.count += 1;
      } else {
        grouped.set(key, { record, subsidySum: record.subsidy, count: 1 });
      }
    }
    const dedupedRecords = Array.from(grouped.values()).map(g => ({
      ...g.record,
      subsidy: Math.round(g.subsidySum / g.count),
    }));

    let upserted = 0;
    for (let i = 0; i < dedupedRecords.length; i += 100) {
      const batch = dedupedRecords.slice(i, i + 100);
      const { error } = await supabase
        .from("competitor_subsidies")
        .upsert(batch, { onConflict: "product_id,partner_name,survey_year,survey_month,category" });
      if (error) throw error;
      upserted += batch.length;
    }

    return NextResponse.json({
      success: true,
      total: rows.length,
      upserted,
      matched,
      unmatched,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
