import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import "./globals.css";
import Sidebar from "@/app/components/Sidebar";
import Header from "@/app/components/Header";
import { getPeriod, formatRange, formatShortRange } from "@/lib/period";

export const metadata: Metadata = {
  title: "렌트리 애널리틱스 대시보드",
  description: "렌탈사별 매출 추이 및 분석",
};

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const syncedAt = await getLastSyncedAt();
  // 기준 구간은 서버에서 계산한다 — 클라이언트에서 new Date()를 쓰면
  // 하이드레이션 시점 차이로 표기가 흔들릴 수 있다.
  const period = getPeriod();
  const basis = {
    month: period.month,
    range: formatRange(period.curr.start, period.curr.end),
    prevRange: formatShortRange(period.prev.start, period.prev.end),
  };

  return (
    <html
      lang="ko"
      className="h-full antialiased"
    >
      <head>
        {/* Pretendard Variable (OFL 1.1) — 동적 서브셋이라 실제로 쓰인 글자의 청크만 받는다.
            globals.css에서 @import 하면 Turbopack이 산출물에서 제거하므로 여기서 <link>로 받는다. */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css"
        />
      </head>
      <body className="h-full flex overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header lastUpdated={syncedAt} basis={basis} />
          <main className="flex-1 overflow-y-auto bg-white">{children}</main>
        </div>
      </body>
    </html>
  );
}
