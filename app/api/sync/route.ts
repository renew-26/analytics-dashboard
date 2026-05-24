import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const REDASH_URL = process.env.REDASH_URL!;
const REDASH_API_KEY = process.env.REDASH_API_KEY!;
const REDASH_QUERY_ID = process.env.REDASH_QUERY_ID!;

interface RedashRow {
  PROP_ITEM_USID: number;
  계약완료일: string;
  주문확정일: string | null;
  렌탈사: string;
  브랜드: string | null;
  카테고리: string | null;
  제품명: string | null;
  월렌탈료: number | null;
  총렌탈료: number | null;
  공헌이익: number | null;
  매출: number | null;
}

async function fetchRedashData(startDate: string, endDate: string): Promise<RedashRow[]> {
  const initRes = await fetch(`${REDASH_URL}/api/queries/${REDASH_QUERY_ID}`, {
    headers: { Authorization: `Key ${REDASH_API_KEY}` },
  });
  const setCookie = initRes.headers.get("set-cookie") ?? "";
  const csrfMatch = setCookie.match(/csrf_token=([^;]+)/);
  const csrfRaw = csrfMatch?.[1] ?? "";
  const csrfToken = decodeURIComponent(csrfRaw).replace(/^"(.*)"$/, "$1");
  const sessionMatch = setCookie.match(/session=([^;]+)/);
  const cookieHeader = [
    csrfMatch ? `csrf_token=${csrfRaw}` : "",
    sessionMatch ? `session=${sessionMatch[1]}` : "",
  ]
    .filter(Boolean)
    .join("; ");

  const jobRes = await fetch(`${REDASH_URL}/api/queries/${REDASH_QUERY_ID}/results`, {
    method: "POST",
    headers: {
      Authorization: `Key ${REDASH_API_KEY}`,
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
      Cookie: cookieHeader,
    },
    body: JSON.stringify({
      max_age: 0,
      parameters: {
        조회기간: { start: startDate, end: endDate },
        row_limit: 100000,
      },
    }),
  });

  const { job } = await jobRes.json();

  let resultId: number | null = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const statusRes = await fetch(`${REDASH_URL}/api/jobs/${job.id}`, {
      headers: { Authorization: `Key ${REDASH_API_KEY}`, Cookie: cookieHeader },
    });
    const { job: j } = await statusRes.json();
    if (j.status === 3) { resultId = j.query_result_id; break; }
    if (j.status === 4) throw new Error(`Redash job failed: ${j.error}`);
  }

  if (!resultId) throw new Error("Redash query timed out");

  const dataRes = await fetch(`${REDASH_URL}/api/query_results/${resultId}`, {
    headers: { Authorization: `Key ${REDASH_API_KEY}`, Cookie: cookieHeader },
  });
  const data = await dataRes.json();
  return data.query_result.data.rows;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const startDate = body.startDate ?? "2026-01-01";
    const endDate = body.endDate ?? new Date().toISOString().slice(0, 10);
    const dataType: string = body.dataType ?? "계약완료";

    const rows = await fetchRedashData(startDate, endDate);

    const records = rows
      .filter((r) => r.PROP_ITEM_USID && r.계약완료일 && r.렌탈사)
      .map((r) => ({
        prop_item_usid: r.PROP_ITEM_USID,
        data_type: dataType,
        contract_date: r.계약완료일.slice(0, 10),
        rental_company: r.렌탈사,
        brand: r.브랜드 ?? null,
        category: r.카테고리 ?? null,
        product_name: r.제품명 ?? null,
        monthly_fee: r.월렌탈료 ?? null,
        total_rental_fee: r.총렌탈료 ?? null,
        contribution_margin: r.공헌이익 ?? null,
        sales: r.매출 ?? null,
        order_confirmed_at: r.주문확정일 ? r.주문확정일.slice(0, 10) : null,
        synced_at: new Date().toISOString(),
      }));

    const { error } = await supabase.from("raw_contracts").upsert(records, {
      onConflict: "prop_item_usid",
      ignoreDuplicates: true,
    });

    if (error) throw new Error(JSON.stringify(error));

    return NextResponse.json({ ok: true, fetched: rows.length, upserted: records.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
