import { createClient } from "@supabase/supabase-js";
import SubsidyClient from "./SubsidyClient";

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
    <div className="p-6">
      <SubsidyClient months={months} />
    </div>
  );
}
