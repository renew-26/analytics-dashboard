-- Redash 4678 통합 마이그레이션
--
-- 배경
--   지금은 4441(주문확정) → raw_orders, 4445(계약완료) → raw_contracts 두 갈래다.
--   두 쿼리는 PROP_STAT 허용목록과 공헌이익 수식이 서로 달라 구조적으로 어긋날 수 있고,
--   총렌탈료를 `월렌탈료 × 계약기간 × 수량` 단순곱으로 계산해 요금면제월·가격프로모션·
--   정액할인을 반영하지 못한다(3개월 실측 3.5~4.5% 과대).
--   4678은 한 쿼리로 세 기준(견적신청/주문확정/계약완료)을 모두 담고 총렌탈료를
--   fn_calc_gmv로 계산한다.
--
-- 동등성 검증 (2026-06-01~08-31)
--   주문확정 27,440건 / 계약완료 17,822건 — USID 전건 일치, 공헌이익 불일치 0건
--   레거시 총렌탈료 재현: 주문확정 27,440건 전건 일치(합계 차 0원),
--   계약완료 17,822건 중 2건 상이 — 그 2건은 4445의 조인 fan-out으로 원본이
--   정확히 2배가 된 건이라 재현값이 옳다.
--
-- 구조
--   raw_prop_items 를 유일한 실체 테이블로 두고(4678 한 행 = 한 로우),
--   raw_orders / raw_contracts 는 기준일로 필터한 VIEW로 재생성한다.
--   앱의 22개 소비처는 수정 없이 그대로 동작한다.
--
-- 실행 순서
--   PHASE 1 을 먼저 실행 → 앱에서 백필 → USID 커버리지 검증 통과 →
--   그 다음에만 PHASE 2 실행. PHASE 2 는 구 테이블을 DROP 하지 않고 _bak 으로
--   리네임하므로 되돌릴 수 있다.
--
-- 대상: Supabase 프로젝트 hfvbozipidhxosrjwcrh


-- ════════════════════════════════════════════════════════════════════
-- PHASE 1 — 통합 테이블 생성 (추가 전용, 기존 테이블 무영향)
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS raw_prop_items (
  prop_item_usid       bigint PRIMARY KEY,

  -- 기준일 3종. 4678은 CONFIRMED_TS OR PROP_COMPLETE_TS 로 조회하므로
  -- 한 로우가 두 기준을 동시에 가질 수 있고, 어느 쪽이든 NULL일 수 있다.
  quote_date           date,          -- 견적신청일
  order_confirmed_at   date,          -- 주문확정일
  contract_date        date,          -- 계약완료일

  status               text,          -- 구분: 주문확정 / 계약완료 / 취소
  settle_status        text,          -- 정산 상태: 정산 완료 / 정산 취소 / 정산 필요

  rental_company       text NOT NULL,
  partner_company      text,
  brand                text,
  category             text,
  product_name         text,
  model_name           text,
  management_type      text,
  management_cycle     text,

  contract_months      numeric,       -- 의무사용기간
  contract_period      numeric,       -- 계약기간 (TRANSFER_PERIOD 음수면 의무사용기간으로 대체된 값)
  quantity             numeric,       -- 수량

  monthly_fee          numeric,       -- 월렌탈료 (단가, 수량 미반영)
  total_rental_fee     numeric,       -- 구 4441/4445 정의 재현 = monthly_fee × contract_period × quantity
  gmv                  numeric,       -- 4678 총렌탈료 = fn_calc_gmv(...) × 수량 ← 정확한 값

  -- 지원금 (전부 수량 반영)
  payback_total        numeric,       -- 총 지원금
  voucher              numeric,       -- 상품권
  coupon_names         text,
  coupon_amount        numeric,
  layer3_subsidy       numeric,
  tv_subsidy           numeric,       -- 추가 TV지원금
  cs_internet_subsidy  numeric,       -- 인터넷 상담원 추가 지원금
  extra_reward_subsidy numeric,       -- 2만원 추가 보상제

  -- 손익 (settle 확정값 우선, 없으면 pnl 계산값)
  sales                numeric,
  sales_incentive      numeric,
  promotion            numeric,
  cost_of_goods        numeric,       -- 매출원가
  financial_cost       numeric,       -- 금융비용
  bad_debt             numeric,
  target_margin        numeric,
  contribution_margin  numeric,
  operating_efficiency numeric,       -- 운영효율 = 공헌이익 - 타겟마진

  synced_at            timestamptz NOT NULL DEFAULT now()
);

-- 소비처가 기준일 범위로 거는 조회를 받쳐준다.
CREATE INDEX IF NOT EXISTS raw_prop_items_order_confirmed_at_idx
  ON raw_prop_items (order_confirmed_at) WHERE order_confirmed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS raw_prop_items_contract_date_idx
  ON raw_prop_items (contract_date) WHERE contract_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS raw_prop_items_category_idx  ON raw_prop_items (category);
CREATE INDEX IF NOT EXISTS raw_prop_items_rental_co_idx ON raw_prop_items (rental_company);

COMMENT ON TABLE raw_prop_items IS
  'Redash 4678(견적신청&주문확정&계약완료 통합 원장) 동기화 대상. raw_orders/raw_contracts는 이 테이블의 뷰.';
COMMENT ON COLUMN raw_prop_items.total_rental_fee IS
  '구 4441/4445 단순곱 정의 재현(호환용). 정확한 GMV는 gmv 컬럼을 쓸 것.';
COMMENT ON COLUMN raw_prop_items.gmv IS
  '4678 fn_calc_gmv 기반 — 요금면제월·가격프로모션·정액할인 반영. 구 정의 대비 3.5~4.5% 낮다.';


-- ════════════════════════════════════════════════════════════════════
-- PHASE 2 — 구 테이블을 백업으로 밀고 동명 뷰로 교체
--           ⚠ 백필 + USID 커버리지 검증 통과 후에만 실행
--
--  ⛔ 아래 PHASE 2 는 실행하지 말 것 — raw_contracts 뷰의 조건이 틀렸다.
--     `AND sales IS NOT NULL` 을 raw_contracts 에도 걸었는데, 구 4445 는 pnl 을
--     INNER JOIN 하지 않아 오늘의 raw_contracts 에는 sales IS NULL 인 2025년 행이
--     그대로 있다(2025-10 은 3,453건 전부 NULL). 그대로 실행하면 2025년 계약완료가
--     전멸한다. raw_orders 쪽 조건은 맞다.
--     → 수정판 + 실측 근거: migrations/2026-09-04_phase2_views.sql
-- ════════════════════════════════════════════════════════════════════

-- BEGIN;
--
-- ALTER TABLE raw_orders    RENAME TO raw_orders_bak_20260902;
-- ALTER TABLE raw_contracts RENAME TO raw_contracts_bak_20260902;
--
-- -- 뷰는 레거시 컬럼 전체를 노출한다. app/page.tsx 의 select("*") 경로가 있어
-- -- 지금 읽히지 않는 컬럼(partner_name, data_type)도 NULL로 유지해 호환을 깨지 않는다.
-- 뷰는 raw_prop_items의 컬럼을 전부 노출한다(4678 36컬럼 + 파생 total_rental_fee).
-- 여기에 구 테이블에만 있던 컬럼을 NULL로 얹어 호환을 유지한다 —
-- app/page.tsx 가 raw_orders를 select("*")로 읽는 경로가 있어 컬럼이 사라지면 안 된다.
-- CREATE VIEW raw_orders AS
-- SELECT
--   prop_item_usid,
--   quote_date, order_confirmed_at, contract_date, status, settle_status,
--   rental_company, partner_company, brand, category, product_name, model_name,
--   management_type, management_cycle,
--   contract_months, contract_period, quantity,
--   monthly_fee, total_rental_fee, gmv,
--   payback_total, voucher, coupon_names, coupon_amount,
--   layer3_subsidy, tv_subsidy, cs_internet_subsidy, extra_reward_subsidy,
--   sales, sales_incentive, promotion, cost_of_goods,
--   financial_cost, bad_debt, target_margin, contribution_margin, operating_efficiency,
--   synced_at,
--   NULL::text AS partner_name   -- 4678에 없음. 읽는 소비처 없음(TPS 쪽 동명 컬럼과 무관)
-- FROM raw_prop_items
-- WHERE order_confirmed_at IS NOT NULL
--   AND sales IS NOT NULL;   -- 구 4441의 INNER JOIN prop_item_pnl 재현 (아래 주석 참고)
--
-- CREATE VIEW raw_contracts AS
-- SELECT
--   prop_item_usid,
--   quote_date, order_confirmed_at, contract_date, status, settle_status,
--   rental_company, partner_company, brand, category, product_name, model_name,
--   management_type, management_cycle,
--   contract_months, contract_period, quantity,
--   monthly_fee, total_rental_fee, gmv,
--   payback_total, voucher, coupon_names, coupon_amount,
--   layer3_subsidy, tv_subsidy, cs_internet_subsidy, extra_reward_subsidy,
--   sales, sales_incentive, promotion, cost_of_goods,
--   financial_cost, bad_debt, target_margin, contribution_margin, operating_efficiency,
--   synced_at,
--   NULL::text AS partner_name,
--   NULL::text AS data_type      -- 구 raw_contracts 잔존 컬럼. 읽는 소비처 없음
-- FROM raw_prop_items
-- WHERE contract_date IS NOT NULL
--   AND sales IS NOT NULL;   -- 구 4445의 pnl 조건 재현 (아래 주석 참고)
--
-- COMMIT;


-- ════════════════════════════════════════════════════════════════════
-- 뷰의 `sales IS NOT NULL` 조건은 왜 필요한가
-- ════════════════════════════════════════════════════════════════════
--
-- 구 4441/4445는 prop_item_pnl 을 INNER JOIN 한다. 4678은 LEFT JOIN 이다.
-- prop_item_pnl 은 2026-01 무렵부터 채워지기 시작해서, 그 전 주문확정 건에는
-- 대부분 손익 원장이 없다. 그래서 같은 기간을 조회해도 두 쿼리의 결과가 다르다.
--
--   주문확정일 월별 (4678 전체 / 손익 있음 / 현재 raw_orders 적재)
--     2025-03    4,581 /     4 /     4
--     2025-12    7,232 / 1,121 / 1,121
--     2026-02    6,469 / 6,469 / 6,469
--   → 적재율(손익 있는 건 대비)은 모든 달 100.0%. 즉 기존 sync는 정상이었고,
--     "2025년이 비어 보이는" 것은 손익 원장 자체가 없어서 4441이 제외한 결과다.
--
-- 4678로 그대로 옮기면 손익 NULL 58,703건이 새로 들어온다. 이 행들은
-- GMV·월렌탈료·카테고리는 있으나 매출·공헌이익이 없다. 앱 다수 지점이
-- `?? 0` 으로 집계하므로 그대로 노출하면 건수는 늘고 금액은 늘지 않아
-- 평균단가·공헌이익률이 왜곡된다.
--
-- 그래서 역할을 나눈다:
--   raw_prop_items — 전량 적재(진짜 원장). 손익 NULL 행도 그대로 보존한다.
--   raw_orders / raw_contracts (뷰) — `sales IS NOT NULL` 로 오늘 동작을 그대로 재현.
-- 전면 개편 때 화면별로 "손익 없는 건을 어떻게 다룰지" 정하면서 이 조건을 풀면 된다.
--
-- 주의: 엄밀히는 4441의 조건은 "pnl 행 존재"이고 여기서는 "COALESCE(settle,pnl) 결과가
-- NOT NULL"이라 완전히 같지는 않다(pnl 없고 settle만 있는 희귀 케이스). 실측으로는
-- 68,724건 vs 현재 68,516건 차이(208건)이며 그 대부분은 최근 미동기화분과 유령행이다.


-- ════════════════════════════════════════════════════════════════════
-- 롤백 (PHASE 2 되돌리기)
-- ════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP VIEW IF EXISTS raw_orders;
-- DROP VIEW IF EXISTS raw_contracts;
-- ALTER TABLE raw_orders_bak_20260902    RENAME TO raw_orders;
-- ALTER TABLE raw_contracts_bak_20260902 RENAME TO raw_contracts;
-- COMMIT;
