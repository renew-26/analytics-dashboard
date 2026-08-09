import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { fetchRedashData } from "@/lib/redash";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * 테스트용: Redash 4625(신규) vs Supabase raw_orders(기존 4441) 행 수 비교
 * POST { startDate, endDate, rentalCompany }
 * 기본: KT렌탈, 최근 3일
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const today = new Date();
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(today.getDate() - 3);

    const startDate = body.startDate ?? threeDaysAgo.toISOString().slice(0, 10);
    const endDate = body.endDate ?? today.toISOString().slice(0, 10);
    const rentalCompany = body.rentalCompany ?? "KT렌탈";

    // 1) 기존 Supabase raw_orders (원본: Redash 4441)
    const { data: existingRows, count: existingCount } = await supabase
      .from("raw_orders")
      .select("prop_item_usid, order_confirmed_at, rental_company, category, product_name, model_name", { count: "exact" })
      .eq("rental_company", rentalCompany)
      .gte("order_confirmed_at", startDate)
      .lte("order_confirmed_at", endDate);

    // 2) 새 Redash 4625 직접 호출
    const newRows = (await fetchRedashData(4625, startDate, endDate)) as Record<string, unknown>[];
    const filteredNewRows = newRows.filter(
      (r) => r["렌탈사"] === rentalCompany
    );

    // 컬럼 이름 확인 (첫 행의 키)
    const newColumns = newRows.length > 0 ? Object.keys(newRows[0]) : [];

    // 누락 컬럼 체크
    const expectedColumns = ["카테고리", "제품명", "모델명"];
    const missingColumns = expectedColumns.filter((c) => !newColumns.includes(c));
    const presentColumns = expectedColumns.filter((c) => newColumns.includes(c));

    // USID 기반 비교
    const existingUsids = new Set((existingRows ?? []).map((r) => r.prop_item_usid));
    const newUsids = new Set(filteredNewRows.map((r) => r["PROP_ITEM_USID"]));

    const onlyInExisting = Array.from(existingUsids).filter((id) => !newUsids.has(id));
    const onlyInNew = Array.from(newUsids).filter((id) => !existingUsids.has(id));

    return NextResponse.json({
      params: { startDate, endDate, rentalCompany },
      existing_4441: {
        count: existingCount,
        sampleUsids: (existingRows ?? []).slice(0, 3).map((r) => r.prop_item_usid),
      },
      new_4625: {
        totalRows: newRows.length,
        filteredCount: filteredNewRows.length,
        columns: newColumns,
        missingColumns,
        presentColumns,
        sampleRow: filteredNewRows[0] ?? null,
      },
      comparison: {
        existingOnly: onlyInExisting.length,
        newOnly: onlyInNew.length,
        overlap: existingUsids.size - onlyInExisting.length,
        sampleExistingOnly: onlyInExisting.slice(0, 5),
        sampleNewOnly: onlyInNew.slice(0, 5),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
