import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { createClient } from "@supabase/supabase-js";
import "./globals.css";
import Sidebar from "@/app/components/Sidebar";
import Header from "@/app/components/Header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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

  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full flex overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header lastUpdated={syncedAt} />
          <main className="flex-1 overflow-y-auto bg-white">{children}</main>
        </div>
      </body>
    </html>
  );
}
