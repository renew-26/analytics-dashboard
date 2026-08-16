WITH target AS (
  -- 지원금 CTE들의 스캔 범위를 조회기간으로 좁힌다. WHERE는 본문과 동일하게 유지할 것.
  SELECT
    pi.PROP_ITEM_USID,
    -- 2만원 추가 보상제(event_payback_usid = 5) 대상 여부.
    -- JSON_CONTAINS는 인덱스를 못 타므로 여기서 한 번만 평가한다.
    JSON_CONTAINS(
      pi.EVENT_PAYBACK_INFO -> '$[*].eventPaybackUsid',
      '5'
    ) AS HAS_EXTRA_REWARD
  FROM
    PROP p
    INNER JOIN PROP_ITEM pi ON pi.PROP_USID = p.PROP_USID
    AND pi.DEL_YN = 0
  WHERE
    p.DEL_YN = 0
    AND p.PROP_STAT IN (
      'INS_ARN',
      'INS_RSV',
      'CON_RVW',
      'PAYB_WAIT',
      'COMPLETE',
      'REQFAIL_H',
      'REQFAIL_I',
      'REQFAIL_J',
      'REQFAIL_K'
    )
    AND (
      (
        p.CONFIRMED_TS >= '{{ 조회기간.start }}'
        AND p.CONFIRMED_TS <= '{{ 조회기간.end }} 23:59:59'
      )
      OR (
        p.PROP_COMPLETE_TS >= '{{ 조회기간.start }}'
        AND p.PROP_COMPLETE_TS <= '{{ 조회기간.end }} 23:59:59'
      )
    )
),
-- prop_payout 스캔 1회로 지원금 4종을 조건부 집계한다 (4405는 CTE 4개로 분리했던 부분).
payout AS (
  SELECT
    pp.prop_item_usid,
    SUM(
      CASE
        WHEN pp.payout_type_key = 2 THEN pp.payout_amt
      END
    ) AS layer3_amt,
    SUM(
      CASE
        WHEN pp.payout_type_key = 4 THEN pp.payout_amt
      END
    ) AS cs_internet_amt,
    SUM(
      CASE
        WHEN pp.payout_type_key = 5
        AND t.HAS_EXTRA_REWARD THEN pp.payout_amt
      END
    ) AS extra_reward_amt,
    SUM(
      CASE
        WHEN pp.payout_type_key = 6 THEN pp.payout_amt
      END
    ) AS tv_amt
  FROM
    prop_payout pp
    INNER JOIN target t ON t.PROP_ITEM_USID = pp.prop_item_usid
  WHERE
    pp.payout_type = 'EVENT_PAYBACK'
    AND pp.del_yn = 0
    AND pp.payout_stat = 'COMPLETE'
  GROUP BY
    pp.prop_item_usid
),
-- 커머스 코스트센터로 정산되는 쿠폰만 집계
coupon AS (
  SELECT
    ci.used_ref_prop_item_usid AS prop_item_usid,
    GROUP_CONCAT(c.coupon_name) AS coupon_names,
    SUM(ci.rewarded_amt) AS coupon_amt
  FROM
    coupon_inventory ci
    INNER JOIN target t ON t.PROP_ITEM_USID = ci.used_ref_prop_item_usid
    INNER JOIN settle_cost_rule scr ON scr.source_type = 'COUPON'
    AND scr.source_type_key = ci.coupon_usid
    AND scr.cost_center = 'COMMERCE'
    AND scr.del_yn = 0
    LEFT JOIN coupon c ON c.coupon_usid = ci.coupon_usid
  WHERE
    ci.del_yn = 0
    AND ci.used = 1
    AND ci.rewarded_dt IS NOT NULL
  GROUP BY
    ci.used_ref_prop_item_usid
)
SELECT
  pi.PROP_ITEM_USID AS `PROP_ITEM_USID`,
  pa.COMPANY AS `파트너명`,
  pa.COMPANY AS `파트너사`,
  GET_RENTAL_COMPANY_NAME(pi.RENTAL_COMPANY) AS `렌탈사`,
  br.KOREAN AS `브랜드`,
  GET_CATEGORY_NAME(prod.PROD_CATG) AS `카테고리`,
  prod.PROD_NAME AS `제품명`,
  po.PROD_OPTION_MODEL_CODE AS `모델명`,
  GET_MANAGETYPE_NAME(pt.MANAGE_TYPE) AS `관리방식`,
  pt.MAIN_CYCLE_PERIOD AS `관리주기`,
  CAST(
    NULLIF(pt.MANDATORY_PERIOD, '') AS DECIMAL(20, 0)
  ) AS `의무사용기간`,
  -- 계약기간: TRANSFER_PERIOD 음수(=소유권 이전 없음)면 MANDATORY_PERIOD로 대체.
  --           아래 fn_calc_gmv 4번 인자와 동일한 식이어야 한다.
  IF(
    CAST(NULLIF(pt.TRANSFER_PERIOD, '') AS DECIMAL(20, 0)) < 0,
    CAST(
      NULLIF(pt.MANDATORY_PERIOD, '') AS DECIMAL(20, 0)
    ),
    CAST(NULLIF(pt.TRANSFER_PERIOD, '') AS DECIMAL(20, 0))
  ) AS `계약기간`,
  pi.QTY AS `수량`,
  -- 월렌탈료는 단가(수량 미반영). 수량 반영값이 필요하면 월렌탈료 × 수량.
  pi.PROP_ITEM_SUBS_PRICE AS `월렌탈료`,
  -- GMV: fn_calc_gmv 10인자 + * QTY (단순 곱셈 금지)
  fn_calc_gmv(
    prod.PROD_CATG,
    -- 1. 상품 카테고리
    COALESCE(opr.PROP_REQ_REG_TS, p.PROP_REG_TS),
    -- 2. 원본 견적요청 일시
    pi.PROP_ITEM_SUBS_PRICE,
    -- 3. 월 요금
    IF(
      CAST(NULLIF(pt.TRANSFER_PERIOD, '') AS DECIMAL(20, 0)) < 0,
      CAST(
        NULLIF(pt.MANDATORY_PERIOD, '') AS DECIMAL(20, 0)
      ),
      CAST(NULLIF(pt.TRANSFER_PERIOD, '') AS DECIMAL(20, 0))
    ),
    -- 4. 계약기간(개월)
    pi.PROP_ITEM_SUBS_DISC_YN,
    -- 5. 요금면제 여부
    pi.PROP_ITEM_SUBS_DISC_MONTHS,
    -- 6. 요금면제월 목록
    pi.PRICE_PROMOTION_YN,
    -- 7. 가격 프로모션 여부
    pi.PRICE_PROMOTION_RATE,
    -- 8. 프로모션 할인율
    pi.PRICE_PROMOTION_PERIOD,
    -- 9. 프로모션 기간(개월)
    IFNULL(pi.FIXED_DISCOUNT_TOTAL, 0) -- 10. 정액할인 총액
  ) * pi.QTY AS `총렌탈료`,
  -- ── 지원금 (4405 이관, 전부 수량 반영) ──
  pi.PROP_ITEM_PAYBACK_DISC * pi.QTY AS `총 지원금 (수량반영)`,
  pi.PROP_ITEM_VOUCHER * pi.QTY AS `상품권 (수량반영)`,
  cp.coupon_names AS `쿠폰명`,
  IFNULL(cp.coupon_amt, 0) AS `쿠폰 금액`,
  IFNULL(pay.layer3_amt, 0) AS `LAYER3 지원금`,
  IFNULL(pay.tv_amt, 0) AS `추가 TV지원금`,
  IFNULL(pay.cs_internet_amt, 0) AS `인터넷 상담원 추가 지원금`,
  IFNULL(pay.extra_reward_amt, 0) AS `2만원 추가 보상제 지원금`,
  -- ── 손익: 정산 확정값(settle) 우선, 없으면 계산값(pnl) ──
  COALESCE(s.sales, pnl.sales) AS `매출`,
  COALESCE(s.sales_incentive, pnl.sales_incentive) AS `판매장려금`,
  COALESCE(s.promotion, pnl.promotion) AS `프로모션`,
  COALESCE(s.cost_of_sales, pnl.cost_of_sales) AS `매출원가`,
  COALESCE(s.finance_cost, pnl.finance_cost) AS `금융비용`,
  COALESCE(s.bad_debt, pnl.bad_debt) AS `대손비`,
  (
    COALESCE(s.sales, pnl.sales) - COALESCE(s.sales_incentive, pnl.sales_incentive) - COALESCE(s.promotion, pnl.promotion) - COALESCE(s.cost_of_sales, pnl.cost_of_sales) - COALESCE(s.finance_cost, pnl.finance_cost) - COALESCE(s.bad_debt, pnl.bad_debt)
  ) AS `공헌이익`,
  COALESCE(s.target_margin, pnl.target_margin) AS `타겟마진`,
  (
    COALESCE(s.sales, pnl.sales) - COALESCE(s.sales_incentive, pnl.sales_incentive) - COALESCE(s.promotion, pnl.promotion) - COALESCE(s.cost_of_sales, pnl.cost_of_sales) - COALESCE(s.finance_cost, pnl.finance_cost) - COALESCE(s.bad_debt, pnl.bad_debt) - COALESCE(s.target_margin, pnl.target_margin)
  ) AS `운영효율`,
  CASE
    s.settle_stat
    WHEN 'COMPLETE' THEN '정산 완료'
    WHEN 'CANCEL' THEN '정산 취소'
    ELSE '정산 필요'
  END AS `정산 상태`,
  DATE(opr.PROP_REQ_REG_TS) AS `견적신청일`,
  DATE(p.CONFIRMED_TS) AS `주문확정일`,
  DATE(p.PROP_COMPLETE_TS) AS `계약완료일`,
  CASE
    WHEN p.PROP_STAT IN ('COMPLETE', 'PAYB_WAIT') THEN '계약완료'
    WHEN p.PROP_STAT LIKE 'REQFAIL%' THEN '취소'
    ELSE '주문확정'
  END AS `구분` -- 실패 사유가 필요하면 아래 3줄의 주석을 해제한다.
  -- , p.PROP_STAT                                                       AS `상세상태`
  -- , CASE WHEN p.PROP_STAT LIKE 'REQFAIL%' THEN p.CANCEL_RSN_TYPE END  AS `취소사유코드`
  -- , DATE(p.CANCEL_TS)                                                 AS `취소일`
FROM
  PROP p
  INNER JOIN PROP_ITEM pi ON pi.PROP_USID = p.PROP_USID
  AND pi.DEL_YN = 0
  INNER JOIN PARTNER pa ON pa.PARTNER_USID = p.PARTNER_USID
  LEFT JOIN PROD prod ON prod.PROD_USID = pi.PROD_USID
  LEFT JOIN BRAND br ON br.BRAND_CODE = prod.BRAND_CODE
  LEFT JOIN PROD_OPTION po ON po.PROD_OPTION_USID = pi.PROD_OPTION_USID
  LEFT JOIN PROD_TERM pt ON pt.PROD_TERM_USID = pi.PROD_TERM_USID
  LEFT JOIN PROP_REQ opr -- 원본 견적요청 (재견적 추적)
  ON opr.PROP_REQ_USID = p.ORIGIN_PROP_REQ_USID
  AND opr.DEL_YN = 0
  LEFT JOIN prop_item_pnl pnl ON pnl.prop_item_usid = pi.PROP_ITEM_USID
  AND pnl.del_yn = 0
  LEFT JOIN settle_prop_item s ON s.prop_item_usid = pi.PROP_ITEM_USID
  AND s.del_yn = 0
  AND s.is_current = 1 -- 재정산 시 이전 행은 is_current = 0
  -- 지원금 CTE (전부 prop_item_usid 단위 1:1 — 행이 늘어나지 않는다)
  LEFT JOIN payout pay ON pay.prop_item_usid = pi.PROP_ITEM_USID
  LEFT JOIN coupon cp ON cp.prop_item_usid = pi.PROP_ITEM_USID
WHERE
  p.DEL_YN = 0
  AND p.PROP_STAT IN (
    'INS_ARN',
    'INS_RSV',
    'CON_RVW',
    'PAYB_WAIT',
    'COMPLETE',
    'REQFAIL_H',
    'REQFAIL_I',
    'REQFAIL_J',
    'REQFAIL_K'
  ) -- 주문확정 또는 계약완료 중 하나라도 조회기간에 걸리면 포함 (세 테이블 동시 커버)
  AND (
    (
      p.CONFIRMED_TS >= '{{ 조회기간.start }}'
      AND p.CONFIRMED_TS <= '{{ 조회기간.end }} 23:59:59'
    )
    OR (
      p.PROP_COMPLETE_TS >= '{{ 조회기간.start }}'
      AND p.PROP_COMPLETE_TS <= '{{ 조회기간.end }} 23:59:59'
    )
  )
ORDER BY
  p.CONFIRMED_TS DESC
LIMIT
  { { row_limit } }