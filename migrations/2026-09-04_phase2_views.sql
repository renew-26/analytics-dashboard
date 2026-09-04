-- PHASE 2 — raw_orders / raw_contracts 를 raw_prop_items 위의 동명 뷰로 교체
--
-- 2026-09-02_unify_to_4678.sql 의 PHASE 2 를 대체한다.
-- 그 파일의 PHASE 2 는 두 뷰에 똑같이 `AND sales IS NOT NULL` 을 걸었는데,
-- 실측하니 raw_contracts 에는 그 조건이 없어야 한다(아래 근거). 그대로 실행하면
-- 2025년 계약완료가 전멸해 홈의 월별 격자·12개월 스파크라인·카테고리 추이가 비었다.
--
-- 대상: Supabase 프로젝트 hfvbozipidhxosrjwcrh
-- 선행 조건: raw_prop_items 백필 완료 — 2025-01 … 2026-09 (21개월, 131,697행)
--
-- ════════════════════════════════════════════════════════════════════
-- 검증 근거 (2026-09-04 실측, 기준일 2026-09-03)
-- ════════════════════════════════════════════════════════════════════
--
-- ① raw_orders → `sales IS NOT NULL` 이 정확하다
--    구 4441 이 prop_item_pnl 을 INNER JOIN 했으므로 손익 없는 건이 애초에 없다.
--      주문확정 월    현재 raw_orders / prop_items 전량 / sales NOT NULL
--      2025-03                    4 /          4,581 /          4  ✓
--      2025-06                   34 /          5,127 /         34  ✓
--      2025-10                  233 /          5,862 /        233  ✓
--      2025-12                1,121 /          7,232 /      1,121  ✓
--      2026-01                5,717 /          7,265 /      5,717  ✓
--
-- ② raw_contracts → `sales IS NOT NULL` 을 걸면 안 된다
--    구 4445 는 pnl 을 INNER JOIN 하지 않았다. 그래서 오늘의 raw_contracts 에는
--    sales IS NULL 인 2025년 행이 그대로 들어 있다(2025-10 은 3,453건 전부 NULL).
--      계약완료 월    현재 raw_contracts / 전량 / sales NOT NULL
--      2025-01                  1,559 / 1,559 /      0   ← 조건 걸면 전멸
--      2025-06                  2,570 / 2,570 /      0   ← 전멸
--      2025-10                  3,453 / 3,453 /      0   ← 전멸
--      2025-12                  4,483 / 4,483 /      0   ← 전멸
--      2026-04                  6,045 / 6,045 /  6,045
--    ⇒ `contract_date IS NOT NULL` 단독이 오늘 동작을 정확히 재현한다.
--
-- ③ 금액 무손실 (2026-09-01~03, 계약완료 643건 · USID 집합 완전 일치)
--      거래액 1,447,511,400 = 1,447,511,400
--      매출·공헌이익·대손비·판매장려금 전부 원 단위까지 일치
--
-- ④ 알고 넘어가는 차이
--    · 계약완료 2026-08 −2건: 원천에서 계약이 취소되며 계약완료일이 회수된 건
--      (usid 6783105·6795559). 구 테이블은 2026-08-11 에 굳어 취소를 못 받았다.
--      뷰 쪽이 맞다 — 구 테이블은 취소된 계약을 계약완료로 계속 세고 있다.
--    · 주문확정 2026-08 −36건 / 2026-09-01~03 −5건(0.50%): 4678 이 주지 않는 행.
--      원 설계 주석의 "208건 — 최근 미동기화분과 유령행"과 같은 부류. 수용하고 넘어간다.
--    · 손익 신선도: 같은 2026-08-01~03 구간의 마지막 동기화가
--      raw_contracts 2026-08-11 vs raw_prop_items 2026-09-04.
--      손익은 사후 확정되므로 뷰 전환 후 전월 분모가 올라간다 —
--      공헌이익 증감률 +64.5% → +56.4%, 매출 +74.4% → +69.5%.
--      기존 값이 "최신 당월 vs 3주 전에 굳은 전월"을 비교한 결과였고, 새 값이 맞다.
--
-- ⑤ 소비처 안전성
--    raw_orders / raw_contracts 참조 35곳 전부 SELECT — 쓰기 경로 없음.
--    동기화는 raw_prop_items 로만 적재한다(app/api/sync/route.ts).
--
-- ════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE raw_orders    RENAME TO raw_orders_bak_20260904;
ALTER TABLE raw_contracts RENAME TO raw_contracts_bak_20260904;

-- 뷰는 raw_prop_items 의 컬럼을 전부 노출하고, 구 테이블에만 있던 컬럼을 NULL 로
-- 얹어 호환을 유지한다 — raw_orders 를 select("*") 로 읽는 경로가 있어
-- 컬럼이 사라지면 안 된다.
--
-- security_invoker 를 켜지 않는다(기본값). 뷰가 소유자 권한으로 raw_prop_items 를
-- 읽으므로, raw_prop_items 자체에 anon SELECT 정책을 열지 않아도 앱이 동작한다.

CREATE VIEW raw_orders AS
SELECT
  prop_item_usid,
  quote_date, order_confirmed_at, contract_date, status, settle_status,
  rental_company, partner_company, brand, category, product_name, model_name,
  management_type, management_cycle,
  contract_months, contract_period, quantity,
  monthly_fee, total_rental_fee, gmv,
  payback_total, voucher, coupon_names, coupon_amount,
  layer3_subsidy, tv_subsidy, cs_internet_subsidy, extra_reward_subsidy,
  sales, sales_incentive, promotion, cost_of_goods,
  financial_cost, bad_debt, target_margin, contribution_margin, operating_efficiency,
  synced_at,
  NULL::text AS partner_name    -- 4678에 없음. 읽는 소비처 없음
FROM raw_prop_items
WHERE order_confirmed_at IS NOT NULL
  AND sales IS NOT NULL;        -- 구 4441의 INNER JOIN prop_item_pnl 재현 (근거 ①)

CREATE VIEW raw_contracts AS
SELECT
  prop_item_usid,
  quote_date, order_confirmed_at, contract_date, status, settle_status,
  rental_company, partner_company, brand, category, product_name, model_name,
  management_type, management_cycle,
  contract_months, contract_period, quantity,
  monthly_fee, total_rental_fee, gmv,
  payback_total, voucher, coupon_names, coupon_amount,
  layer3_subsidy, tv_subsidy, cs_internet_subsidy, extra_reward_subsidy,
  sales, sales_incentive, promotion, cost_of_goods,
  financial_cost, bad_debt, target_margin, contribution_margin, operating_efficiency,
  synced_at,
  NULL::text AS partner_name,
  NULL::text AS data_type       -- 구 raw_contracts 잔존 컬럼. 읽는 소비처 없음
FROM raw_prop_items
WHERE contract_date IS NOT NULL;
-- ⚠ sales 조건을 넣지 않는다 — 넣으면 2025년이 전멸한다 (근거 ②)

-- PostgREST 는 role 권한으로 접근한다. 구 테이블에 있던 접근을 뷰에도 부여한다.
GRANT SELECT ON raw_orders    TO anon, authenticated, service_role;
GRANT SELECT ON raw_contracts TO anon, authenticated, service_role;

COMMIT;


-- ════════════════════════════════════════════════════════════════════
-- 실행 후 확인 (둘 다 true 여야 한다)
-- ════════════════════════════════════════════════════════════════════
-- SELECT
--   (SELECT count(*) FROM raw_contracts
--      WHERE contract_date BETWEEN '2025-10-01' AND '2025-10-31') = 3453
--     AS "2025-10 계약완료 3453건 유지",
--   (SELECT count(*) FROM raw_orders
--      WHERE order_confirmed_at BETWEEN '2025-12-01' AND '2025-12-31') = 1121
--     AS "2025-12 주문확정 1121건 유지";


-- ════════════════════════════════════════════════════════════════════
-- 롤백
-- ════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP VIEW IF EXISTS raw_orders;
-- DROP VIEW IF EXISTS raw_contracts;
-- ALTER TABLE raw_orders_bak_20260904    RENAME TO raw_orders;
-- ALTER TABLE raw_contracts_bak_20260904 RENAME TO raw_contracts;
-- COMMIT;
