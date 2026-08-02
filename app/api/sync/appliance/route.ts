import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchRedashData } from "@/lib/redash";
import { REDASH_QUERY } from "@/lib/redash";
import { buildApplianceMonthlyBest, ApplianceMonthlyBest } from "@/lib/tps/applianceRentreSubsidy";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function last30Days(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

function productKey(modelNumber: string, contractPeriod: number | null): string {
  return `${modelNumber.toLowerCase()}::${contractPeriod ?? ""}`;
}

const PAGE_SIZE = 1000;

async function fetchAllActiveApplianceProducts(): Promise<{ id: string; model_number: string | null; contract_period: number | null }[]> {
  const rows: { id: string; model_number: string | null; contract_period: number | null }[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("products")
      .select("id, model_number, contract_period")
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
    const { start, end } = last30Days();
    const rows = await fetchRedashData(REDASH_QUERY.APPLIANCE_ORDERS, start, end, 9999, "조회기간");
    if (rows.length === 0) {
      return NextResponse.json({ error: "Redash 4441 데이터를 가져오지 못했습니다." }, { status: 502 });
    }

    const monthlyBest = buildApplianceMonthlyBest(rows as Record<string, unknown>[]);

    // 30일 범위가 두 달에 걸치면 모델당 최신 월 값만 카탈로그에 반영한다.
    const latestByProduct = new Map<string, ApplianceMonthlyBest>();
    for (const item of monthlyBest) {
      const key = productKey(item.modelNumber, item.contractPeriod);
      const existing = latestByProduct.get(key);
      if (!existing || item.year > existing.year || (item.year === existing.year && item.month > existing.month)) {
        latestByProduct.set(key, item);
      }
    }

    const existingProducts = await fetchAllActiveApplianceProducts();

    const existingByKey = new Map<string, string>();
    for (const p of existingProducts) {
      if (!p.model_number) continue;
      existingByKey.set(productKey(p.model_number, p.contract_period), p.id);
    }

    let updated = 0;
    let inserted = 0;
    const seenKeys = new Set<string>();

    for (const item of latestByProduct.values()) {
      const key = productKey(item.modelNumber, item.contractPeriod);
      seenKeys.add(key);
      const existingId = existingByKey.get(key);

      if (existingId) {
        const { error } = await supabase
          .from("products")
          .update({
            name: item.productName,
            brand: item.brand,
            appliance_category: item.category,
            management_type: item.managementType,
            our_subsidy: item.subsidy,
            commission: item.commission,
            bad_debt: item.badDebt,
            is_active: true,
          })
          .eq("id", existingId);
        if (error) throw error;
        updated += 1;
      } else {
        const { error } = await supabase
          .from("products")
          .insert({
            category: "appliance",
            name: item.productName,
            brand: item.brand,
            appliance_category: item.category,
            model_number: item.modelNumber,
            contract_period: item.contractPeriod,
            management_type: item.managementType,
            monthly_fee: 0,
            our_subsidy: item.subsidy,
            commission: item.commission,
            bad_debt: item.badDebt,
            score: 50,
            is_active: true,
          });
        if (error) throw error;
        inserted += 1;
      }
    }

    let deactivated = 0;
    for (const [key, id] of existingByKey) {
      if (!seenKeys.has(key)) {
        const { error } = await supabase.from("products").update({ is_active: false }).eq("id", id);
        if (error) throw error;
        deactivated += 1;
      }
    }

    return NextResponse.json({ success: true, updated, inserted, deactivated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
