import DashboardSections from "@/app/components/DashboardSections";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ hide2025?: string }>;
}) {
  return <DashboardSections searchParams={searchParams} />;
}
