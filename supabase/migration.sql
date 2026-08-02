-- tps-dashboard → analytics-dashboard 마이그레이션
-- 이 파일은 analytics Supabase 대시보드에서 직접 실행합니다.

-- ============================================================
-- 1. 테이블 생성
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  brand TEXT,
  our_subsidy NUMERIC NOT NULL DEFAULT 0,
  commission NUMERIC NOT NULL DEFAULT 0,
  bad_debt NUMERIC NOT NULL DEFAULT 0,
  effective_subsidy NUMERIC NOT NULL DEFAULT 0,
  score NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- TPS / 유심
  telecom TEXT,
  product_type TEXT,
  has_usim_bundle BOOLEAN NOT NULL DEFAULT false,
  usim_product TEXT,
  -- 가전
  model_number TEXT,
  appliance_category TEXT,
  monthly_fee NUMERIC NOT NULL DEFAULT 0,
  management_type TEXT,
  contract_period INTEGER,
  -- 선정 이력
  selection_count INTEGER NOT NULL DEFAULT 0,
  last_selected_year INTEGER,
  last_selected_month INTEGER,
  -- 수수료 시트 연동
  commission_key TEXT,
  commission_channel TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS competitor_subsidies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id),
  category TEXT,
  brand TEXT,
  product_name TEXT NOT NULL DEFAULT '',
  model_number TEXT,
  partner_name TEXT,
  subsidy NUMERIC NOT NULL DEFAULT 0,
  management_type TEXT,
  survey_year INTEGER NOT NULL,
  survey_month INTEGER NOT NULL,
  bad_debt_applicable BOOLEAN NOT NULL DEFAULT false,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, partner_name, survey_year, survey_month, category)
);

CREATE TABLE IF NOT EXISTS margin_settings (
  id INTEGER PRIMARY KEY,
  tps_baseline_rate NUMERIC NOT NULL DEFAULT 0,
  appliance_baseline_rate NUMERIC NOT NULL DEFAULT 0,
  tps_bad_debt_rate NUMERIC NOT NULL DEFAULT 0,
  appliance_bad_debt_rate NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appliance_rentre_subsidy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL UNIQUE REFERENCES products(id),
  doublecheck_subsidy NUMERIC NOT NULL DEFAULT 0,
  doublecheck_commission NUMERIC NOT NULL DEFAULT 0,
  doublecheck_bad_debt NUMERIC NOT NULL DEFAULT 0,
  other_partner_subsidy NUMERIC,
  other_partner_name TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS survey_selection_catalog_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '[]'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS survey_selection_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  identity_key TEXT NOT NULL,
  identity_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_survey_year INTEGER,
  last_survey_month INTEGER,
  survey_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category, identity_key)
);

-- ============================================================
-- 2. 기본 데이터
-- ============================================================

INSERT INTO margin_settings (id, tps_baseline_rate, appliance_baseline_rate, tps_bad_debt_rate, appliance_bad_debt_rate)
VALUES (1, 0, 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. RLS 정책 (내부 전용 도구 — anon role 전체 접근 허용)
-- 보안 참고: 외부 공개 시 반드시 인증 추가 필요
-- ============================================================

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_select" ON products FOR SELECT TO anon USING (true);
CREATE POLICY "products_insert" ON products FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "products_update" ON products FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "products_delete" ON products FOR DELETE TO anon USING (true);

ALTER TABLE competitor_subsidies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "competitor_subsidies_select" ON competitor_subsidies FOR SELECT TO anon USING (true);
CREATE POLICY "competitor_subsidies_insert" ON competitor_subsidies FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "competitor_subsidies_update" ON competitor_subsidies FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "competitor_subsidies_delete" ON competitor_subsidies FOR DELETE TO anon USING (true);

ALTER TABLE margin_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "margin_settings_select" ON margin_settings FOR SELECT TO anon USING (true);
CREATE POLICY "margin_settings_update" ON margin_settings FOR UPDATE TO anon USING (true) WITH CHECK (true);

ALTER TABLE appliance_rentre_subsidy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "appliance_rentre_subsidy_select" ON appliance_rentre_subsidy FOR SELECT TO anon USING (true);
CREATE POLICY "appliance_rentre_subsidy_insert" ON appliance_rentre_subsidy FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "appliance_rentre_subsidy_update" ON appliance_rentre_subsidy FOR UPDATE TO anon USING (true) WITH CHECK (true);

ALTER TABLE survey_selection_catalog_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "survey_selection_catalog_cache_select" ON survey_selection_catalog_cache FOR SELECT TO anon USING (true);
CREATE POLICY "survey_selection_catalog_cache_insert" ON survey_selection_catalog_cache FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "survey_selection_catalog_cache_update" ON survey_selection_catalog_cache FOR UPDATE TO anon USING (true) WITH CHECK (true);

ALTER TABLE survey_selection_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "survey_selection_history_select" ON survey_selection_history FOR SELECT TO anon USING (true);
CREATE POLICY "survey_selection_history_insert" ON survey_selection_history FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "survey_selection_history_update" ON survey_selection_history FOR UPDATE TO anon USING (true) WITH CHECK (true);
