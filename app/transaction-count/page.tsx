import DashboardSections from "@/app/components/DashboardSections";

export const dynamic = "force-dynamic";

export default async function TransactionCountPage({
  searchParams,
}: {
  searchParams: Promise<{ hide2025?: string }>;
}) {
  return (
    <>
      <div className="px-12 pt-6">
        <h1 className="text-2xl font-bold text-[#222222]">전체 거래건수</h1>
        <p className="text-sm text-[#788093] mt-1">
          주문확정 · 계약완료 기준 당월 거래 현황 (전일까지 기준)
        </p>
      </div>
      <DashboardSections searchParams={searchParams} />
    </>
  );
}
