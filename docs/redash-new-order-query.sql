-- 대시보드용 주문확정 쿼리 (Redash 4441 대체)
-- 기존 4625 쿼리 기반, 대시보드에서 사용하는 컬럼만 SELECT
-- 파라미터: {{조회기간}}, {{row_limit}}
SELECT
  pi.PROP_ITEM_USID AS `PROP_ITEM_USID`,
  DATE(opr.PROP_REQ_REG_TS) AS `견적신청일`,
  DATE(p.CONFIRMED_TS) AS `주문확정일`,
  GET_RENTAL_COMPANY_NAME(pi.RENTAL_COMPANY) AS `렌탈사`,
  prod.PROD_BRAND AS `브랜드`,
  prod.PROD_CATG AS `카테고리`,
  prod.PROD_NAME AS `제품명`,
  po.PROD_OPTION_MODEL_CODE AS `모델명`,
  GET_MANAGETYPE_NAME(pt.MANAGE_TYPE) AS `관리방식`,
  pt.MAIN_CYCLE_PERIOD AS `관리주기`,
  CAST(
    NULLIF(pt.MANDATORY_PERIOD, '') AS DECIMAL(20, 0)
  ) AS `의무사용기간`,
  pa.COMPANY AS `파트너명`,
  -- 파트너사: 기존 4441과 동일한 매핑이면 pa.COMPANY, 별도 그룹이면 조정 필요
  pa.COMPANY AS `파트너사`,
  pi.PROP_ITEM_SUBS_PRICE AS `월렌탈료`,
  -- 총렌탈료 = GMV (fn_calc_gmv 사용)
  fn_calc_gmv(
    prod.PROD_CATG,
    COALESCE(opr.PROP_REQ_REG_TS, p.PROP_REG_TS),
    pi.PROP_ITEM_SUBS_PRICE,
    IF(
      CAST(NULLIF(pt.TRANSFER_PERIOD, '') AS DECIMAL(20, 0)) < 0,
      CAST(
        NULLIF(pt.MANDATORY_PERIOD, '') AS DECIMAL(20, 0)
      ),
      CAST(NULLIF(pt.TRANSFER_PERIOD, '') AS DECIMAL(20, 0))
    ),
    pi.PROP_ITEM_SUBS_DISC_YN,
    pi.PROP_ITEM_SUBS_DISC_MONTHS,
    pi.PRICE_PROMOTION_YN,
    pi.PRICE_PROMOTION_RATE,
    pi.PRICE_PROMOTION_PERIOD,
    IFNULL(pi.FIXED_DISCOUNT_TOTAL, 0)
  ) * pi.QTY AS `총렌탈료`,
  COALESCE(s.sales, pnl.sales) AS `매출`,
  COALESCE(s.sales_incentive, pnl.sales_incentive) AS `판매장려금`,
  COALESCE(s.promotion, pnl.promotion) AS `프로모션`,
  COALESCE(s.cost_of_sales, pnl.cost_of_sales) AS `매출원가`,
  COALESCE(s.finance_cost, pnl.finance_cost) AS `금융비용`,
  COALESCE(s.bad_debt, pnl.bad_debt) AS `대손비`,
  (
    COALESCE(s.sales, pnl.sales) - COALESCE(s.sales_incentive, pnl.sales_incentive) - COALESCE(s.promotion, pnl.promotion) - COALESCE(s.cost_of_sales, pnl.cost_of_sales) - COALESCE(s.finance_cost, pnl.finance_cost) - COALESCE(s.bad_debt, pnl.bad_debt)
  ) AS `공헌이익`,
  DATE(p.PROP_COMPLETE_TS) AS `계약완료일`,
  CASE
    WHEN s.settle_stat = 'COMPLETE' THEN '정산 완료'
    WHEN s.settle_stat = 'CANCEL' THEN '정산 취소'
    WHEN pnl.pnl_usid IS NOT NULL THEN '정산 필요'
    ELSE '대기'
  END AS `정산상태`,
  p.PROP_STAT AS `견적상태`
FROM
  PROP p
  INNER JOIN PROP_ITEM pi ON pi.PROP_USID = p.PROP_USID
  AND pi.DEL_YN = 0
  INNER JOIN PARTNER pa ON pa.PARTNER_USID = p.PARTNER_USID
  LEFT JOIN PROD prod ON prod.PROD_USID = pi.PROD_USID
  LEFT JOIN PROD_OPTION po ON po.PROD_OPTION_USID = pi.PROD_OPTION_USID
  LEFT JOIN PROD_TERM pt ON pt.PROD_TERM_USID = pi.PROD_TERM_USID
  LEFT JOIN PROP_REQ opr ON opr.PROP_REQ_USID = p.ORIGIN_PROP_REQ_USID
  AND opr.DEL_YN = 0
  LEFT JOIN prop_item_pnl pnl ON pnl.prop_item_usid = pi.PROP_ITEM_USID
  AND pnl.del_yn = 0
  LEFT JOIN settle_prop_item s ON s.prop_item_usid = pi.PROP_ITEM_USID
  AND s.del_yn = 0
  AND s.is_current = 1
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
  AND p.CONFIRMED_TS >= '{{ 조회기간.start }}'
  AND p.CONFIRMED_TS <= '{{ 조회기간.end }} 23:59:59'
ORDER BY
  p.CONFIRMED_TS DESC
LIMIT
  { { row_limit } }