import { createClient } from "@supabase/supabase-js";
import Header from "@/app/components/Header";
import {
  getPeriod,
  getDataAsOf,
  formatRange,
  formatShortRange,
} from "@/lib/period";

function formatSyncedAt(isoString: string): string {
  // Parse in KST by re-interpreting the UTC timestamp as a local Seoul date
  const kst = new Date(
    new Date(isoString).toLocaleString("en-US", { timeZone: "Asia/Seoul" }),
  );
  const yy = String(kst.getFullYear()).slice(2);
  const mm = String(kst.getMonth() + 1).padStart(2, "0");
  const dd = String(kst.getDate()).padStart(2, "0");
  const h = kst.getHours();
  const min = String(kst.getMinutes()).padStart(2, "0");
  return `${yy}-${mm}-${dd} ${h}:${min}`;
}

async function getLastSyncedAt(): Promise<string | null> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data } = await supabase
      .from("raw_contracts")
      .select("synced_at")
      .order("synced_at", { ascending: false })
      .limit(1)
      .single();
    return data?.synced_at ? formatSyncedAt(data.synced_at) : null;
  } catch (e) {
    console.error("getLastSyncedAt failed:", e);
    return null;
  }
}

/**
 * 헤더의 Supabase 의존 부분만 따로 뗀 서버 컴포넌트.
 *
 * 이 두 번의 await 가 RootLayout 에 있으면 레이아웃 전체가 막혀 페이지 본문까지
 * 같이 늦어진다 — 동기화 시각 한 줄과 기준 구간 배지 때문에 모든 네비게이션이
 * 서버 왕복만큼 정지한다. Suspense 경계 안으로 내리면 제목이 먼저 그려지고
 * 이 둘만 나중에 채워진다.
 */
export default async function HeaderData() {
  const syncedAt = await getLastSyncedAt();
  // 기준 구간은 서버에서 계산한다 — 클라이언트에서 new Date()를 쓰면
  // 하이드레이션 시점 차이로 표기가 흔들릴 수 있다.
  const period = getPeriod(await getDataAsOf());
  const basis = {
    month: period.month,
    prevMonth: Number(period.prev.start.slice(5, 7)),
    range: formatRange(period.curr.start, period.curr.end),
    prevRange: formatShortRange(period.prev.start, period.prev.end),
  };

  return <Header lastUpdated={syncedAt} basis={basis} />;
}
