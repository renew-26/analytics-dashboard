import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchRedashData } from "@/lib/redash";
import { REDASH_QUERY } from "@/lib/redash";
import { parseApplianceSnapshot } from "@/lib/tps/applianceRentreSubsidy";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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
    const rows = await fetchRedashData(REDASH_QUERY.APPLIANCE_SNAPSHOT);
    if (rows.length === 0) {
      return NextResponse.json({ error: "Redash 4633 데이터를 가져오지 못했습니다." }, { status: 502 });
    }

    const snapshot = parseApplianceSnapshot(rows as Record<string, unknown>[]);
    const products = await fetchAllActiveApplianceProducts();

    const productByKey = new Map<string, string>();
    for (const p of products) {
      if (!p.model_number) continue;
      productByKey.set(productKey(p.model_number, p.contract_period), p.id);
    }

    let upserted = 0;
    let unmatched = 0;

    for (const item of snapshot) {
      const productId = productByKey.get(productKey(item.modelNumber, item.contractPeriod));
      if (!productId) {
        unmatched += 1;
        continue;
      }

      const { error } = await supabase
        .from("appliance_rentre_subsidy")
        .upsert(
          {
            product_id: productId,
            doublecheck_subsidy: item.doublecheckSubsidy,
            doublecheck_commission: item.doublecheckCommission,
            doublecheck_bad_debt: item.doublecheckBadDebt,
            other_partner_subsidy: item.otherPartnerSubsidy,
            other_partner_name: item.otherPartnerName,
            synced_at: new Date().toISOString(),
          },
          { onConflict: "product_id" },
        );
      if (error) throw error;
      upserted += 1;
    }

    return NextResponse.json({ success: true, upserted, unmatched });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
