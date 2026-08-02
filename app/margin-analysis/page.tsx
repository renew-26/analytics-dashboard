export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { MarginAnalysisClient } from "@/app/components/tps/MarginAnalysisClient";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PAGE_SIZE = 50000;

async function fetchAllProducts(categories: string[]) {
  const allProducts = [];
  for (const category of categories) {
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("category", category)
        .eq("is_active", true)
        .range(from, from + PAGE_SIZE - 1);
      if (error) break;
      allProducts.push(...data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }
  return allProducts;
}

export default async function MarginAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const { year, month } = await searchParams;
  const initialPeriod =
    year && month ? `${year}-${month.padStart(2, "0")}` : undefined;

  const [
    products,
    { data: subsidies },
    { data: settings },
    { data: applianceRentreSubsidy },
  ] = await Promise.all([
    fetchAllProducts(["tps", "appliance"]),
    supabase
      .from("competitor_subsidies")
      .select("*")
      .order("survey_year", { ascending: false })
      .order("survey_month", { ascending: false }),
    supabase.from("margin_settings").select("*").eq("id", 1).single(),
    supabase.from("appliance_rentre_subsidy").select("*"),
  ]);

  return (
    <div className="px-12 py-6 mx-auto">
      <MarginAnalysisClient
        initialProducts={products ?? []}
        initialSubsidies={subsidies ?? []}
        initialTpsBaselineRate={settings?.tps_baseline_rate ?? 0.077}
        initialApplianceBaselineRate={
          settings?.appliance_baseline_rate ?? 0.055
        }
        initialTpsBadDebtRate={settings?.tps_bad_debt_rate ?? 0.05}
        initialApplianceBadDebtRate={
          settings?.appliance_bad_debt_rate ?? 0.1
        }
        initialPeriod={initialPeriod}
        initialApplianceRentreSubsidy={applianceRentreSubsidy ?? []}
      />
    </div>
  );
}
