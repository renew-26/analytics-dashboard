import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { fetchRedashData, REDASH_QUERY } from "@/lib/redash";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Redash 4678 — 견적신청&주문확정&계약완료 통합 원장. order/contract 양쪽의 원천.
 *
 * 4678은 기간 필터가 `CONFIRMED_TS OR PROP_COMPLETE_TS`라서 주문확정일·계약완료일 중
 * 하나만 기간에 걸린 행도 함께 온다. 그래서 적재할 때 각 기준 날짜로 다시 걸러야 한다.
 * (걸러지 않으면 raw_orders에 주문확정일이 기간 밖인 행이 섞인다 — 3개월 실측 기준 38%)
 */
interface Redash4678Row {
  PROP_ITEM_USID: number;
  견적신청일: string | null;
  주문확정일: string | null;
  계약완료일: string | null;
  구분: string | null;
  "정산 상태": string | null;
  렌탈사: string;
  파트너사: string | null;
  브랜드: string | null;
  카테고리: string | null;
  제품명: string | null;
  모델명: string | null;
  관리방식: string | null;
  관리주기: string | null;
  의무사용기간: number | null;
  계약기간: number | null;
  수량: number | null;
  월렌탈료: number | null;
  총렌탈료: number | null;
  "총 지원금 (수량반영)": number | null;
  "상품권 (수량반영)": number | null;
  쿠폰명: string | null;
  "쿠폰 금액": number | null;
  "LAYER3 지원금": number | null;
  "추가 TV지원금": number | null;
  "인터넷 상담원 추가 지원금": number | null;
  "2만원 추가 보상제 지원금": number | null;
  매출: number | null;
  판매장려금: number | null;
  프로모션: number | null;
  매출원가: number | null;
  금융비용: number | null;
  대손비: number | null;
  타겟마진: number | null;
  공헌이익: number | null;
  운영효율: number | null;
}

/** 날짜 문자열을 YYYY-MM-DD로 자른다 (NULL 허용) */
const day = (value: string | null) => (value ? value.slice(0, 10) : null);

/**
 * 4441/4445의 기존 총렌탈료 정의(월렌탈료 × 계약기간 × 수량)를 4678 컬럼으로 재현한다.
 * 화면 숫자를 그대로 유지하기 위한 것이며, 4678의 정확한 GMV(fn_calc_gmv 기반 —
 * 요금면제·프로모션·정액할인 반영)는 gmv 컬럼에 따로 적재한다.
 * 3개월 실측: 주문확정 27,440건 전건 일치, 계약완료 17,822건 중 2건만 상이
 * (그 2건은 4445의 조인 fan-out으로 원본이 2배가 된 건이라 재현값이 맞다).
 */
const legacyTotalRentalFee = (r: Redash4678Row) =>
  r.월렌탈료 === null || r.계약기간 === null
    ? null
    : r.월렌탈료 * r.계약기간 * (r.수량 ?? 1);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const startDate = body.startDate ?? "2026-01-01";
    const endDate = body.endDate ?? new Date().toISOString().slice(0, 10);
    // order/contract는 4678 통합 이후 prop_items와 동일 경로다 (호출부 호환을 위해 유지).
    const type: "prop_items" | "contract" | "order" | "auto_quote" | "auto_quote_typea" | "tps_pnl" =
      body.type ?? "prop_items";

    if (type === "tps_pnl") {
      const rows = (await fetchRedashData(REDASH_QUERY.TPS_PNL, startDate, endDate, 100000, "견적완료일시")) as Record<string, unknown>[];

      const records = rows
        .filter((r) => r["PROP_ITEM_USID"])
        .map((r) => {
          const n = (k: string) => { const v = r[k]; return (v === null || v === undefined || v === "") ? null : Number(v); };
          const s = (k: string) => (r[k] as string | null) ?? null;
          return {
            prop_item_usid: r["PROP_ITEM_USID"] as number,
            brand: s("대상 제품 브랜드"),
            model_code: s("대상 제품 모델코드"),
            monthly_fee: n("월렌탈료"),
            contract_months: n("계약기간") !== null ? Math.round(n("계약기간")!) : null,
            total_subsidy: n("총 지원금 (수량반영)"),
            voucher: n("상품권 (수량반영)"),
            coupon_amount: n("쿠폰 금액"),
            tv_subsidy: n("추가 TV지원금"),
            internet_consultant_subsidy: n("인터넷 상담원 추가 지원금"),
            extra_reward_subsidy: n("2만원 추가 보상제 지원금"),
            layer3_subsidy: n("LAYER3 지원금"),
            total_contract_amount: n("총 계약금액 (수량반영)"),
            quote_status: s("견적상태"),
            order_confirmed_at: s("주문확정일") ? s("주문확정일")!.slice(0, 10) : null,
            contract_completed_at: s("계약완료일 (지원금 지급일)") ? s("계약완료일 (지원금 지급일)")!.slice(0, 10) : null,
            sales: n("매출"),
            bad_debt: n("대손비"),
            promotion: n("프로모션"),
            settle_status: s("정산 상태"),
            target_margin: n("공헌이익_타겟마진"),
            synced_at: new Date().toISOString(),
          };
        });

      const deduped = Object.values(
        Object.fromEntries(records.map((r) => [r.prop_item_usid, r]))
      );

      const { error } = await supabase.from("tps_pnl").upsert(deduped, {
        onConflict: "prop_item_usid",
        ignoreDuplicates: false,
      });

      if (error) throw new Error(JSON.stringify(error));
      return NextResponse.json({ ok: true, fetched: rows.length, upserted: deduped.length });
    }

    if (type === "auto_quote_typea") {
      const rows = (await fetchRedashData(REDASH_QUERY.AUTO_QUOTE_TYPEA, undefined, undefined, "100000")) as Record<string, unknown>[];

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
      const rows = (await fetchRedashData(REDASH_QUERY.AUTO_QUOTE)) as Record<string, unknown>[];

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

    // prop_items (기본) — order/contract도 같은 경로로 처리한다.
    //
    // 4678의 한 행은 견적신청·주문확정·계약완료 세 기준 날짜를 동시에 담으므로
    // 기준별로 나눠 저장할 필요가 없다. 기준 분리는 raw_orders/raw_contracts 뷰가 한다.
    // 그래서 여기서는 4678이 준 행을 기준일로 걸러내지 않고 전부 적재한다 —
    // 계약완료일로만 걸린 행도 그 prop_item의 정당한 최신 상태이기 때문이다.
    const rows = (await fetchRedashData(REDASH_QUERY.PROP_ITEMS, startDate, endDate)) as Redash4678Row[];

    const syncedAt = new Date().toISOString();
    const records = rows
      .filter((r) => r.PROP_ITEM_USID && r.렌탈사)
      .map((r) => ({
        prop_item_usid: r.PROP_ITEM_USID,

        quote_date: day(r.견적신청일),
        order_confirmed_at: day(r.주문확정일),
        contract_date: day(r.계약완료일),
        status: r.구분 ?? null,
        settle_status: r["정산 상태"] ?? null,

        rental_company: r.렌탈사,
        partner_company: r.파트너사 ?? null,
        brand: r.브랜드 ?? null,
        category: r.카테고리 ?? null,
        product_name: r.제품명 ?? null,
        model_name: r.모델명 ?? null,
        management_type: r.관리방식 ?? null,
        management_cycle: r.관리주기 ?? null,

        contract_months: r.의무사용기간 ?? null,
        contract_period: r.계약기간 ?? null,
        quantity: r.수량 ?? null,

        monthly_fee: r.월렌탈료 ?? null,
        total_rental_fee: legacyTotalRentalFee(r),
        gmv: r.총렌탈료 ?? null,

        payback_total: r["총 지원금 (수량반영)"] ?? null,
        voucher: r["상품권 (수량반영)"] ?? null,
        coupon_names: r.쿠폰명 ?? null,
        coupon_amount: r["쿠폰 금액"] ?? null,
        layer3_subsidy: r["LAYER3 지원금"] ?? null,
        tv_subsidy: r["추가 TV지원금"] ?? null,
        cs_internet_subsidy: r["인터넷 상담원 추가 지원금"] ?? null,
        extra_reward_subsidy: r["2만원 추가 보상제 지원금"] ?? null,

        sales: r.매출 ?? null,
        sales_incentive: r.판매장려금 ?? null,
        promotion: r.프로모션 ?? null,
        cost_of_goods: r.매출원가 ?? null,
        financial_cost: r.금융비용 ?? null,
        bad_debt: r.대손비 ?? null,
        target_margin: r.타겟마진 ?? null,
        contribution_margin: r.공헌이익 ?? null,
        operating_efficiency: r.운영효율 ?? null,

        synced_at: syncedAt,
      }));

    const { error } = await supabase.from("raw_prop_items").upsert(records, {
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
