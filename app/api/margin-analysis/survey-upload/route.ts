import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseSurveyExcel } from "@/lib/tps/surveyExcelParser";
import { buildTpsIdentityKey, buildTpsCommissionLookup } from "@/lib/tps/tpsSync";
import { fetchRedashData } from "@/lib/redash";
import { REDASH_QUERY } from "@/lib/redash";
import {
  buildCompetitorRecordFromAppliance,
  buildCompetitorRecordFromTps,
  buildUnmatchedCompetitorRecord,
  dedupeCompetitorRecords,
  parseContractPeriod,
  findCrossValidationFlags,
  LABEL_TO_TELECOM,
  CompetitorSubsidyInsert,
  ProductLookup,
  TpsProductLookup,
} from "@/lib/tps/competitorSync";
import { buildApplianceSnapshotLookup } from "@/lib/tps/applianceRentreSubsidy";
import { calcEstimatedCompetitorMarginRate } from "@/lib/tps/marginCalculation";
import { computeInternetSubsidy, computeApplianceSubsidy } from "@/lib/tps/surveySubsidyImputation";
import { suggestSimilarProducts } from "@/lib/tps/productSimilarity";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PAGE_SIZE = 1000;

async function fetchAllActiveProducts(category: string) {
  const rows = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("products")
      .select("id, telecom, name, model_number, brand, contract_period, effective_subsidy")
      .eq("category", category)
      .eq("is_active", true)
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

interface TpsSurveyEntry extends Record<string, unknown> {
  telecom: string;
  model_name: string;
  partner_name: string;
  subsidy: number;
  subsidy_missing: boolean;
  subsidy_estimated: boolean;
  survey_year: number;
  survey_month: number;
}

// 인터넷/유심 시트는 헤더명만 다를 뿐 구조가 같다(둘 다 통신사+상품명으로 tps 상품과 매칭한다).
// computeInternetSubsidy가 기대하는 옛 헤더명으로 리네임한 뷰를 만들어 그대로 재사용한다.
function toInternetSubsidyRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    "총 지원금": row["경쟁사 총지원금"] ?? row["총 지원금\n (최종)"],
    "현금 혜택": row["현금 혜택"],
    "상품권 혜택": row["상품권 혜택"],
    "추가현금": row["추가 현금"],
    "리뷰보너스": row["리뷰+추천\n 보너스"],
  };
}

function extractTpsSurveyRecords(rows: Record<string, unknown>[]): TpsSurveyEntry[] {
  const records: TpsSurveyEntry[] = [];
  for (const row of rows) {
    const telecom = String(row["통신사"] ?? "").trim();
    const modelName = String(row["상품명"] ?? "").trim();
    const partner = String(row["경쟁사"] ?? "").trim();
    const surveyYear = Number(row["survey_year"]);
    const surveyMonth = Number(row["survey_month"]);
    if (!telecom || !modelName || !partner || !surveyYear || !surveyMonth) continue;

    const { subsidy, estimated, missing } = computeInternetSubsidy(toInternetSubsidyRow(row));
    records.push({ telecom, model_name: modelName, partner_name: partner, subsidy, subsidy_missing: missing, subsidy_estimated: estimated, survey_year: surveyYear, survey_month: surveyMonth });
  }
  return records;
}

interface ApplianceSurveyEntry {
  brand: string;
  model_number: string;
  partner_name: string;
  subsidy: number;
  contract_period: number | null;
  subsidy_missing: boolean;
  subsidy_estimated: boolean;
  survey_year: number;
  survey_month: number;
}

function extractApplianceSurveyRecords(rows: Record<string, unknown>[]): ApplianceSurveyEntry[] {
  const records: ApplianceSurveyEntry[] = [];
  for (const row of rows) {
    const brand = String(row["브랜드"] ?? "").trim();
    const modelNo = String(row["모델명"] ?? "").trim();
    const partner = String(row["경쟁사"] ?? "").trim();
    const surveyYear = Number(row["survey_year"]);
    const surveyMonth = Number(row["survey_month"]);
    if ((!brand && !modelNo) || !partner || !surveyYear || !surveyMonth) continue;

    const contractPeriod = parseContractPeriod(row["계약기간"]);
    // 가전 최종 시트엔 구성요소 컬럼이나 '추가 혜택' 텍스트 필드가 없어서 결측 시
    // 자동 보정이 불가능하고 바로 '미입력'으로 플래그된다 — 정상 동작.
    const { subsidy, estimated, missing } = computeApplianceSubsidy({ "지원금": row["경쟁사 총지원금"] });
    records.push({ brand, model_number: modelNo, partner_name: partner, subsidy, contract_period: contractPeriod, subsidy_missing: missing, subsidy_estimated: estimated, survey_year: surveyYear, survey_month: surveyMonth });
  }
  return records;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "파일이 필요합니다." }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const sheets = parseSurveyExcel(buffer);

    const tpsRows = await fetchRedashData(REDASH_QUERY.TPS_QUOTE);
    const tpsCommissionLookup = buildTpsCommissionLookup(tpsRows as Record<string, unknown>[]);

    const { data: applianceSnapshotRows } = await supabase.from("appliance_rentre_subsidy").select("*");
    const applianceSnapshotLookup = buildApplianceSnapshotLookup(applianceSnapshotRows ?? []);

    const { data: settingsRow } = await supabase
      .from("margin_settings").select("*").eq("id", 1).single();
    const tpsBadDebtRate = settingsRow?.tps_bad_debt_rate ?? 0.05;
    const applianceBadDebtRate = settingsRow?.appliance_bad_debt_rate ?? 0.10;

    const records: CompetitorSubsidyInsert[] = [];
    const unmatchedOut: Record<string, unknown>[] = [];
    const subsidyMissingOut: Record<string, unknown>[] = [];
    const marginEstimates: { partner_name: string; product_name: string; commission: number; marginRate: number; subsidy_estimated?: boolean }[] = [];

    const needsTpsProducts = Boolean(sheets["인터넷"] || sheets["유심"]);
    const tpsProductsRaw = needsTpsProducts ? await fetchAllActiveProducts("tps") : [];
    const tpsProducts: TpsProductLookup[] = tpsProductsRaw
      .filter(p => p.telecom && p.name)
      .map(p => ({ id: p.id, telecom: p.telecom as string, name: p.name }));
    const tpsEffectiveSubsidyById = new Map(
      tpsProductsRaw.map(p => [p.id, p.effective_subsidy as number | null])
    );

    if (sheets["인터넷"]) {
      for (const entry of extractTpsSurveyRecords(sheets["인터넷"])) {
        const { record, matched } = buildCompetitorRecordFromTps(entry, tpsProducts, entry.survey_year, entry.survey_month);
        if (entry.subsidy_missing) {
          const rentreSubsidy = matched && record?.product_id
            ? tpsEffectiveSubsidyById.get(record.product_id) ?? null
            : null;
          subsidyMissingOut.push({ ...entry, category: "tps", rentreSubsidy });
          continue;
        }
        if (matched && record) {
          records.push(record);
          const key = buildTpsIdentityKey({ telecom: tpsProducts.find(p => p.id === record.product_id)!.telecom, name: entry.model_name });
          const commission = tpsCommissionLookup.get(key);
          if (commission) {
            marginEstimates.push({
              partner_name: entry.partner_name,
              product_name: entry.model_name,
              commission,
              marginRate: calcEstimatedCompetitorMarginRate({
                commission, badDebtRate: tpsBadDebtRate,
                competitorSubsidy: entry.subsidy, badDebtApplicable: record.bad_debt_applicable,
              }),
              subsidy_estimated: entry.subsidy_estimated,
            });
          }
        } else {
          records.push(buildUnmatchedCompetitorRecord({ ...entry, model_number: entry.model_name }, "tps", entry.survey_year, entry.survey_month));
          const targetTelecomCode = LABEL_TO_TELECOM[entry.telecom] ?? entry.telecom;
          const suggestions = suggestSimilarProducts(
            entry.model_name,
            tpsProducts.filter(p => p.telecom === targetTelecomCode).map(p => ({ id: p.id, name: p.name, brand: null, contractPeriod: null })),
          );
          unmatchedOut.push({ ...entry, category: "tps", reason: "no_product_match", suggestions });
        }
      }
    }

    if (sheets["유심"]) {
      for (const entry of extractTpsSurveyRecords(sheets["유심"])) {
        const { record, matched } = buildCompetitorRecordFromTps(entry, tpsProducts, entry.survey_year, entry.survey_month);
        if (entry.subsidy_missing) {
          const rentreSubsidy = matched && record?.product_id
            ? tpsEffectiveSubsidyById.get(record.product_id) ?? null
            : null;
          subsidyMissingOut.push({ ...entry, category: "usim", rentreSubsidy });
          continue;
        }
        if (matched && record) {
          // 유심 결합 지원금은 별도 카테고리로 저장한다 — 같은 tps 상품이라도 인터넷 단독
          // 지원금과는 다른 조사 대상이라 하나로 평균내면 안 된다.
          records.push({ ...record, category: "usim" });
          // TPS 커미션(견적)은 유심 결합 여부에 따라 달라지는데 Redash #4622는 상품 단위로만
          // 구분되어 유심 결합분과 1:1 대응이 불명확하므로, marginEstimates는 인터넷 시트
          // 매칭분만 계산한다.
        } else {
          records.push(buildUnmatchedCompetitorRecord({ ...entry, model_number: entry.model_name }, "usim", entry.survey_year, entry.survey_month));
          const targetTelecomCode = LABEL_TO_TELECOM[entry.telecom] ?? entry.telecom;
          const suggestions = suggestSimilarProducts(
            entry.model_name,
            tpsProducts.filter(p => p.telecom === targetTelecomCode).map(p => ({ id: p.id, name: p.name, brand: null, contractPeriod: null })),
          );
          unmatchedOut.push({ ...entry, category: "usim", reason: "no_product_match", suggestions });
        }
      }
    }

    if (sheets["가전"]) {
      const productsRaw = await fetchAllActiveProducts("appliance");
      const applianceProducts: ProductLookup[] = productsRaw.map(p => ({
        id: p.id, modelNumber: p.model_number, name: p.name, brand: p.brand, contractPeriod: p.contract_period,
      }));

      for (const entry of extractApplianceSurveyRecords(sheets["가전"])) {
        const row = { "모델명": entry.model_number, "파트너사": entry.partner_name, "브랜드명": entry.brand, "지원금": entry.subsidy, "제품 카테고리": "appliance", "계약기간": entry.contract_period };
        const { record, matched } = buildCompetitorRecordFromAppliance(row, applianceProducts, entry.survey_year, entry.survey_month);
        if (entry.subsidy_missing) {
          const snapshot = matched && record?.product_id ? applianceSnapshotLookup.get(record.product_id) : undefined;
          subsidyMissingOut.push({ ...entry, category: "appliance", rentreSubsidy: snapshot?.doublecheckSubsidy ?? null });
          continue;
        }
        if (matched && record) {
          records.push(record);
          const snapshot = applianceSnapshotLookup.get(record.product_id!);
          if (snapshot) {
            marginEstimates.push({
              partner_name: entry.partner_name,
              product_name: entry.model_number,
              commission: snapshot.doublecheckCommission,
              marginRate: calcEstimatedCompetitorMarginRate({
                commission: snapshot.doublecheckCommission, badDebtRate: applianceBadDebtRate,
                competitorSubsidy: entry.subsidy, badDebtApplicable: record.bad_debt_applicable,
              }),
              subsidy_estimated: entry.subsidy_estimated,
            });
          }
        } else {
          records.push(buildUnmatchedCompetitorRecord(entry, "appliance", entry.survey_year, entry.survey_month));
          const suggestions = suggestSimilarProducts(
            entry.model_number,
            applianceProducts
              .filter(p => !entry.brand || p.brand === entry.brand)
              .map(p => ({ id: p.id, name: p.modelNumber ?? p.name, brand: p.brand, contractPeriod: p.contractPeriod })),
          );
          unmatchedOut.push({ ...entry, category: "appliance", reason: "no_product_match", suggestions });
        }
      }
    }

    if (records.length === 0) {
      return NextResponse.json({ error: "파싱된 인터넷/유심/가전 조사 데이터가 없습니다." }, { status: 400 });
    }

    const deduped = dedupeCompetitorRecords(records);
    const crossValidationFlags = findCrossValidationFlags(records);
    const partnerNames = Array.from(new Set(deduped.map(r => r.partner_name)));
    const periods = Array.from(new Set(deduped.map(r => `${r.survey_year}-${String(r.survey_month).padStart(2, "0")}`))).sort();

    // 한 파일에 여러 조사월·여러 카테고리가 섞여 있으므로 (category, survey_year, survey_month)
    // 단위로 묶어 그룹마다 delete-then-insert를 반복한다 — 재업로드해도 중복이 쌓이지 않는다.
    const groups = new Map<string, CompetitorSubsidyInsert[]>();
    for (const record of deduped) {
      const key = `${record.category}::${record.survey_year}::${record.survey_month}`;
      const list = groups.get(key) ?? [];
      list.push(record);
      groups.set(key, list);
    }

    for (const [key, groupRecords] of groups) {
      const [category, yearStr, monthStr] = key.split("::");
      const groupPartners = Array.from(new Set(groupRecords.map(r => r.partner_name)));
      const { error: deleteError } = await supabase
        .from("competitor_subsidies").delete()
        .eq("category", category).eq("survey_year", Number(yearStr)).eq("survey_month", Number(monthStr))
        .in("partner_name", groupPartners);
      if (deleteError) throw deleteError;

      const { error: insertError } = await supabase.from("competitor_subsidies").insert(groupRecords);
      if (insertError) throw insertError;
    }

    return NextResponse.json({
      matched: deduped.length - unmatchedOut.length,
      unmatched: unmatchedOut,
      subsidyMissing: subsidyMissingOut,
      crossValidationFlags,
      marginEstimates,
      partnerNames,
      periods,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
