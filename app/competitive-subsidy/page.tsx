import { createClient } from "@supabase/supabase-js";
import SubsidyClient from "./SubsidyClient";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function CompetitiveSubsidyPage() {
  const { data } = await supabase
    .from("competitive_subsidy")
    .select("year_month")
    .order("year_month", { ascending: false });

  const months = [
    ...new Set((data ?? []).map((r: { year_month: string }) => r.year_month)),
  ];

  return (
    <div className="px-12 py-6 mx-auto">
      <SubsidyClient months={months} />
    </div>
  );
}
