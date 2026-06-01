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
const QUERY_ID_AUTO_QUOTE = 4404;
const QUERY_ID_AUTO_QUOTE_TYPEA = 4403;

interface RedashContractRow {
  PROP_ITEM_USID: number;
  계약완료일: string;
  주문확정일: string | null;
  렌탈사: string;
  브랜드: string | null;
  카테고리: string | null;
  제품명: string | null;
  모델명: string | null;
  파트너명: string | null;
  파트너사: string | null;
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
  월렌탈료: number | null;
  총렌탈료: number | null;
  매출: number | null;
  판매장려금: number | null;
  프로모션: number | null;
  매출원가: number | null;
  금융비용: number | null;
  대손비: number | null;
  공헌이익: number | null;
}

async function fetchRedashData(
  queryId: number,
  startDate?: string,
  endDate?: string,
  rowLimit: string | number = 100000,
): Promise<unknown[]> {
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

  const parameters: Record<string, unknown> = { row_limit: rowLimit };
  if (startDate && endDate) {
    parameters["조회기간"] = { start: startDate, end: endDate };
  }

  const jobRes = await fetch(`${REDASH_URL}/api/queries/${queryId}/results`, {
    method: "POST",
    headers: {
      Authorization: `Key ${REDASH_API_KEY}`,
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
      Cookie: cookieHeader,
    },
    body: JSON.stringify({ max_age: 0, parameters }),
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
    const type: "contract" | "order" | "auto_quote" | "auto_quote_typea" = body.type ?? "contract";

    if (type === "auto_quote_typea") {
      const rows = (await fetchRedashData(QUERY_ID_AUTO_QUOTE_TYPEA, undefined, undefined, "100000")) as Record<string, unknown>[];

      const records = rows
        .filter((r) => r["prod_term_usid"])
        .map((r) => {
          const n = (k: string) => { const v = r[k]; return (v === null || v === undefined || v === "") ? null : Number(v); };
          const s = (k: string) => (r[k] as string | null) ?? null;
          return {
            prod_term_usid: r["prod_term_usid"] as number,
            prod_usid: n("상품 USID"),
            prod_option_usid: n("prod_option_usid"),
            product_visibility: s("상품 노출상태"),
            option_visibility: s("옵션 노출상태"),
            term_visibility: s("계약조건 노출상태"),
            category: s("카테고리"),
            brand: s("브랜드"),
            product_name: s("제품명"),
            model_name: s("모델명"),
            color_name: s("색상명"),
            management_type: s("관리방식"),
            management_cycle: s("관리주기"),
            contract_months: n("의무사용기간"),
            ownership_months: n("계약기간 (소유권 이전 기간)"),
            admin_monthly_fee: n("예상월렌탈료(어드민)"),
            admin_support: n("예상지원금(어드민)"),
            half_discount: n("반값 할인 유무"),
            half_discount_months: n("반값 할인 기간"),
            updated_at: s("최근수정일"),
            key_value: s("키값"),
            // 더블체크 파트너스
            dc_auto_quote_usid: n("더블체크 파트너스_자동견적 USID"),
            dc_quote_status: s("더블체크 파트너스_견적 발송 상태"),
            dc_lowest_partner: s("더블체크_최저가(지원금순)_파트너사"),
            dc_lowest_rental_company: s("더블체크_최저가(지원금순)_렌탈사"),
            dc_monthly_fee: n("더블체크 파트너스_월렌탈료"),
            dc_waiver_months: n("더블체크 파트너스_월요금면제월"),
            dc_support: n("더블체크 파트너스_지원금"),
            dc_total_payment: n("더블체크 파트너스_실납부총액"),
            dc_additional_benefit: s("더블체크 파트너스_추가혜택"),
            dc_memo: s("더블체크 파트너스_메모"),
            dc_label: s("더블체크 파트너스_라벨"),
            dc_sales: n("더블체크 파트너스_예상매출"),
            dc_sales_incentive: n("더블체크 파트너스_예상판매장려금"),
            dc_promotion: n("더블체크 파트너스_예상프로모션"),
            dc_cost_of_goods: n("더블체크 파트너스_예상매출원가"),
            dc_financial_cost: n("더블체크 파트너스_예상금융비용"),
            dc_bad_debt: n("더블체크 파트너스_예상대손"),
            dc_expected_margin: n("더블체크 파트너스_예상공헌이익"),
            synced_at: new Date().toISOString(),
          };
        });

      // deduplicate by prod_term_usid (keep last occurrence)
      const deduped = Object.values(
        Object.fromEntries(records.map((r) => [r.prod_term_usid, r]))
      );

      const { error } = await supabase.from("auto_quote_typea").upsert(deduped, {
        onConflict: "prod_term_usid",
        ignoreDuplicates: false,
      });

      if (error) throw new Error(JSON.stringify(error));
      return NextResponse.json({ ok: true, fetched: rows.length, upserted: deduped.length });
    }

    if (type === "auto_quote") {
      const rows = (await fetchRedashData(QUERY_ID_AUTO_QUOTE)) as Record<string, unknown>[];

      const records = rows
        .filter((r) => r["prod_term_usid"])
        .map((r) => {
          const n = (k: string) => { const v = r[k]; return (v === null || v === undefined || v === "") ? null : Number(v); };
          const s = (k: string) => (r[k] as string | null) ?? null;
          return {
            prod_term_usid: r["prod_term_usid"] as number,
            category: s("카테고리"),
            brand: s("브랜드"),
            product_name: s("제품명"),
            model_name: s("모델명"),
            management_type: s("관리방식"),
            contract_months: n("의무사용기간"),
            // LG헬로비전
            lghv_monthly_fee: n("LG헬로비전_월렌탈료"),
            lghv_support: n("LG헬로비전_지원금"),
            lghv_total_payment: n("LG헬로비전_실납부총액"),
            lghv_waiver_months: n("LG헬로비전_월요금면제월"),
            lghv_expected_margin: n("LG헬로비전_예상공헌이익"),
            // 이니렌탈
            ini_monthly_fee: n("이니렌탈_월렌탈료"),
            ini_support: n("이니렌탈_지원금"),
            ini_total_payment: n("이니렌탈_실납부총액"),
            ini_waiver_months: n("이니렌탈_월요금면제월"),
            ini_expected_margin: n("이니렌탈_예상공헌이익"),
            // 현대유버스
            hyundai_monthly_fee: n("현대유버스_월렌탈료"),
            hyundai_support: n("현대유버스_지원금"),
            hyundai_total_payment: n("현대유버스_실납부총액"),
            hyundai_waiver_months: n("현대유버스_월요금면제월"),
            hyundai_expected_margin: n("현대유버스_예상공헌이익"),
            // BS렌탈
            bs_monthly_fee: n("BS렌탈_월렌탈료"),
            bs_support: n("BS렌탈_지원금"),
            bs_total_payment: n("BS렌탈_실납부총액"),
            bs_waiver_months: n("BS렌탈_월요금면제월"),
            bs_expected_margin: n("BS렌탈_예상공헌이익"),
            // 스마트렌탈
            smart_monthly_fee: n("스마트렌탈_월렌탈료"),
            smart_support: n("스마트렌탈_지원금"),
            smart_total_payment: n("스마트렌탈_실납부총액"),
            smart_waiver_months: n("스마트렌탈_월요금면제월"),
            smart_expected_margin: n("스마트렌탈_예상공헌이익"),
            // 캐리어
            carrier_monthly_fee: n("캐리어_월렌탈료"),
            carrier_support: n("캐리어_지원금"),
            carrier_total_payment: n("캐리어_실납부총액"),
            carrier_waiver_months: n("캐리어_월요금면제월"),
            carrier_expected_margin: n("캐리어_예상공헌이익"),
            // 바디프랜드
            body_monthly_fee: n("바디프랜드_월렌탈료"),
            body_support: n("바디프랜드_지원금"),
            body_total_payment: n("바디프랜드_실납부총액"),
            body_waiver_months: n("바디프랜드_월요금면제월"),
            body_expected_margin: n("바디프랜드_예상공헌이익"),
            // KT렌탈
            kt_monthly_fee: n("KT렌탈_월렌탈료"),
            kt_support: n("KT렌탈_지원금"),
            kt_total_payment: n("KT렌탈_실납부총액"),
            kt_waiver_months: n("KT렌탈_월요금면제월"),
            kt_expected_margin: n("KT렌탈_예상공헌이익"),
            synced_at: new Date().toISOString(),
          };
        });

      // deduplicate by prod_term_usid (keep last occurrence)
      const deduped = Object.values(
        Object.fromEntries(records.map((r) => [r.prod_term_usid, r]))
      );

      const { error } = await supabase.from("auto_quote_typeb").upsert(deduped, {
        onConflict: "prod_term_usid",
        ignoreDuplicates: false,
      });

      if (error) throw new Error(JSON.stringify(error));
      return NextResponse.json({ ok: true, fetched: rows.length, upserted: deduped.length });
    }

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
          monthly_fee: r.월렌탈료 ?? null,
          total_rental_fee: r.총렌탈료 ?? null,
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
        model_name: r.모델명 ?? null,
        partner_name: r.파트너명 ?? null,
        partner_company: r.파트너사 ?? null,
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
