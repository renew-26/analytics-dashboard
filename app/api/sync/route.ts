import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const REDASH_URL = process.env.REDASH_URL!;
const REDASH_API_KEY = process.env.REDASH_API_KEY!;

const QUERY_ID_CONTRACT = 4445;
const QUERY_ID_ORDER = 4441;

interface RedashContractRow {
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
  판매장려금: number | null;
  프로모션: number | null;
  매출원가: number | null;
  금융비용: number | null;
  대손비: number | null;
}

interface RedashOrderRow {
  PROP_ITEM_USID: number;
  견적신청일: string | null;
  주문확정일: string | null;
  렌탈사: string;
  브랜드: string | null;
  카테고리: string | null;
  제품명: string | null;
  모델명: string | null;
  파트너명: string | null;
  파트너사: string | null;
  매출: number | null;
  판매장려금: number | null;
  프로모션: number | null;
  매출원가: number | null;
  금융비용: number | null;
  대손비: number | null;
  공헌이익: number | null;
}

async function fetchRedashData(queryId: number, startDate: string, endDate: string): Promise<unknown[]> {
  const initRes = await fetch(`${REDASH_URL}/api/queries/${queryId}`, {
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

  const jobRes = await fetch(`${REDASH_URL}/api/queries/${queryId}/results`, {
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
    const type: "contract" | "order" = body.type ?? "contract";

    if (type === "order") {
      const rows = (await fetchRedashData(QUERY_ID_ORDER, startDate, endDate)) as RedashOrderRow[];

      const records = rows
        .filter((r) => r.PROP_ITEM_USID && r.렌탈사)
        .map((r) => ({
          prop_item_usid: r.PROP_ITEM_USID,
          quote_date: r.견적신청일 ? r.견적신청일.slice(0, 10) : null,
          order_confirmed_at: r.주문확정일 ? r.주문확정일.slice(0, 10) : null,
          rental_company: r.렌탈사,
          brand: r.브랜드 ?? null,
          category: r.카테고리 ?? null,
          product_name: r.제품명 ?? null,
          model_name: r.모델명 ?? null,
          partner_name: r.파트너명 ?? null,
          partner_company: r.파트너사 ?? null,
          sales: r.매출 ?? null,
          sales_incentive: r.판매장려금 ?? null,
          promotion: r.프로모션 ?? null,
          cost_of_goods: r.매출원가 ?? null,
          financial_cost: r.금융비용 ?? null,
          bad_debt: r.대손비 ?? null,
          contribution_margin: r.공헌이익 ?? null,
          synced_at: new Date().toISOString(),
        }));

      const { error } = await supabase.from("raw_orders").upsert(records, {
        onConflict: "prop_item_usid",
        ignoreDuplicates: false,
      });

      if (error) throw new Error(JSON.stringify(error));
      return NextResponse.json({ ok: true, fetched: rows.length, upserted: records.length });
    }

    // contract (default)
    const rows = (await fetchRedashData(QUERY_ID_CONTRACT, startDate, endDate)) as RedashContractRow[];

    const records = rows
      .filter((r) => r.PROP_ITEM_USID && r.계약완료일 && r.렌탈사)
      .map((r) => ({
        prop_item_usid: r.PROP_ITEM_USID,
        contract_date: r.계약완료일.slice(0, 10),
        rental_company: r.렌탈사,
        brand: r.브랜드 ?? null,
        category: r.카테고리 ?? null,
        product_name: r.제품명 ?? null,
        monthly_fee: r.월렌탈료 ?? null,
        total_rental_fee: r.총렌탈료 ?? null,
        contribution_margin: r.공헌이익 ?? null,
        sales: r.매출 ?? null,
        sales_incentive: r.판매장려금 ?? null,
        promotion: r.프로모션 ?? null,
        cost_of_goods: r.매출원가 ?? null,
        financial_cost: r.금융비용 ?? null,
        bad_debt: r.대손비 ?? null,
        order_confirmed_at: r.주문확정일 ? r.주문확정일.slice(0, 10) : null,
        synced_at: new Date().toISOString(),
      }));

    const { error } = await supabase.from("raw_contracts").upsert(records, {
      onConflict: "prop_item_usid",
      ignoreDuplicates: false,
    });

    if (error) throw new Error(JSON.stringify(error));
    return NextResponse.json({ ok: true, fetched: rows.length, upserted: records.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
