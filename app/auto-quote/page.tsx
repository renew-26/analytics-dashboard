import { createClient } from "@supabase/supabase-js";
import AutoQuoteClient from "./AutoQuoteClient";

export const dynamic = "force-dynamic";

// auto_quote tables have RLS — must use service role key (server only)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type TypeBRow = {
  prod_term_usid: number;
  category: string | null;
  brand: string | null;
  product_name: string | null;
  model_name: string | null;
  management_type: string | null;
  contract_months: number | null;
  lghv_monthly_fee: number | null;
  lghv_support: number | null;
  lghv_total_payment: number | null;
  lghv_waiver_months: number | null;
  lghv_expected_margin: number | null;
  ini_monthly_fee: number | null;
  ini_support: number | null;
  ini_total_payment: number | null;
  ini_waiver_months: number | null;
  ini_expected_margin: number | null;
  hyundai_monthly_fee: number | null;
  hyundai_support: number | null;
  hyundai_total_payment: number | null;
  hyundai_waiver_months: number | null;
  hyundai_expected_margin: number | null;
  bs_monthly_fee: number | null;
  bs_support: number | null;
  bs_total_payment: number | null;
  bs_waiver_months: number | null;
  bs_expected_margin: number | null;
  smart_monthly_fee: number | null;
  smart_support: number | null;
  smart_total_payment: number | null;
  smart_waiver_months: number | null;
  smart_expected_margin: number | null;
  carrier_monthly_fee: number | null;
  carrier_support: number | null;
  carrier_total_payment: number | null;
  carrier_waiver_months: number | null;
  carrier_expected_margin: number | null;
  body_monthly_fee: number | null;
  body_support: number | null;
  body_total_payment: number | null;
  body_waiver_months: number | null;
  body_expected_margin: number | null;
  kt_monthly_fee: number | null;
  kt_support: number | null;
  kt_total_payment: number | null;
  kt_waiver_months: number | null;
  kt_expected_margin: number | null;
};

export type TypeARow = {
  prod_term_usid: number;
  category: string | null;
  brand: string | null;
  product_name: string | null;
  model_name: string | null;
  management_type: string | null;
  contract_months: number | null;
  dc_monthly_fee: number | null;
  dc_support: number | null;
  dc_total_payment: number | null;
  dc_waiver_months: number | null;
  dc_expected_margin: number | null;
};

export default async function AutoQuotePage() {
  const [{ data: typeb }, { data: typea }] = await Promise.all([
    supabaseAdmin
      .from("auto_quote_typeb")
      .select(
        "prod_term_usid,category,brand,product_name,model_name,management_type,contract_months," +
          "lghv_monthly_fee,lghv_support,lghv_total_payment,lghv_waiver_months,lghv_expected_margin," +
          "ini_monthly_fee,ini_support,ini_total_payment,ini_waiver_months,ini_expected_margin," +
          "hyundai_monthly_fee,hyundai_support,hyundai_total_payment,hyundai_waiver_months,hyundai_expected_margin," +
          "bs_monthly_fee,bs_support,bs_total_payment,bs_waiver_months,bs_expected_margin," +
          "smart_monthly_fee,smart_support,smart_total_payment,smart_waiver_months,smart_expected_margin," +
          "carrier_monthly_fee,carrier_support,carrier_total_payment,carrier_waiver_months,carrier_expected_margin," +
          "body_monthly_fee,body_support,body_total_payment,body_waiver_months,body_expected_margin," +
          "kt_monthly_fee,kt_support,kt_total_payment,kt_waiver_months,kt_expected_margin",
      ),
    supabaseAdmin
      .from("auto_quote_typea")
      .select(
        "prod_term_usid,category,brand,product_name,model_name,management_type,contract_months," +
          "dc_monthly_fee,dc_support,dc_total_payment,dc_waiver_months,dc_expected_margin",
      ),
  ]);

  return (
    <div className="px-12 py-6 mx-auto">
      <AutoQuoteClient
        typeb={(typeb ?? []) as unknown as TypeBRow[]}
        typea={(typea ?? []) as unknown as TypeARow[]}
      />
    </div>
  );
}
