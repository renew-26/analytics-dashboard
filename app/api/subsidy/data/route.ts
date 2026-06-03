import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const yearMonth = searchParams.get("year_month");

  if (!yearMonth) {
    // 사용 가능한 월 목록 반환
    const { data, error } = await supabase
      .from("competitive_subsidy")
      .select("year_month")
      .order("year_month", { ascending: false });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const months = [...new Set((data ?? []).map((r) => r.year_month))];
    return NextResponse.json({ ok: true, months });
  }

  const { data, error } = await supabase
    .from("competitive_subsidy")
    .select("*")
    .eq("year_month", yearMonth)
    .order("type")
    .order("category")
    .order("product_name");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, data: data ?? [] });
}
