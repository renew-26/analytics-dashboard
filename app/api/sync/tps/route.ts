import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildTps4622Lookup, buildTpsIdentityKey } from "@/lib/tps/tpsSync";
import { fetchRedashData } from "@/lib/redash";
import { REDASH_QUERY } from "@/lib/redash";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST() {
  try {
    const rows = await fetchRedashData(REDASH_QUERY.TPS_QUOTE) as Record<string, unknown>[];
    if (rows.length === 0) {
      return NextResponse.json({ error: "Redash 4622 데이터를 가져오지 못했습니다." }, { status: 502 });
    }

    const lookup = buildTps4622Lookup(rows);

    const { data: products, error: selectError } = await supabase
      .from("products")
      .select("id, telecom, name")
      .eq("category", "tps")
      .eq("is_active", true);
    if (selectError) throw selectError;

    let matched = 0;
    let unmatched = 0;

    for (const p of products ?? []) {
      if (!p.telecom || !p.name) { unmatched += 1; continue; }
      const values = lookup.get(buildTpsIdentityKey({ telecom: p.telecom, name: p.name }));
      if (!values) { unmatched += 1; continue; }

      const { error } = await supabase
        .from("products")
        .update({
          effective_subsidy: values.effectiveSubsidy,
          our_subsidy: values.ourSubsidy,
          commission: values.commission,
          bad_debt: values.badDebt,
        })
        .eq("id", p.id);
      if (error) throw error;
      matched += 1;
    }

    return NextResponse.json({ success: true, matched, unmatched });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
