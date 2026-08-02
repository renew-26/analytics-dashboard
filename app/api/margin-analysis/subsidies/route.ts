import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface SubsidyEntryInput {
  product_id: string;
  partner_name: string;
  survey_year: number;
  survey_month: number;
  subsidy: number;
  bad_debt_applicable: boolean;
  category?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const entries: SubsidyEntryInput[] = body?.entries ?? [];

    if (entries.length === 0) {
      return NextResponse.json({ error: "입력할 항목이 없습니다." }, { status: 400 });
    }

    const invalid = entries.filter(e =>
      !e.product_id || !e.partner_name || !e.survey_year || !e.survey_month || e.subsidy === undefined || e.subsidy === null
    );
    if (invalid.length > 0) {
      return NextResponse.json({ error: `필수 항목이 누락된 행이 ${invalid.length}개 있습니다.` }, { status: 400 });
    }

    const { data: products } = await supabase
      .from("products")
      .select("id, name, brand")
      .eq("category", "tps");

    const productInfo = new Map(products?.map(p => [p.id, { name: p.name, brand: p.brand }]));

    const records = entries.map(e => ({
      product_id: e.product_id,
      category: e.category ?? "tps",
      brand: productInfo.get(e.product_id)?.brand ?? null,
      product_name: productInfo.get(e.product_id)?.name ?? "",
      partner_name: e.partner_name,
      subsidy: e.subsidy,
      survey_year: e.survey_year,
      survey_month: e.survey_month,
      bad_debt_applicable: e.bad_debt_applicable,
    }));

    const { error } = await supabase
      .from("competitor_subsidies")
      .upsert(records, { onConflict: "product_id,partner_name,survey_year,survey_month,category" });
    if (error) throw error;

    return NextResponse.json({ success: true, saved: records.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
