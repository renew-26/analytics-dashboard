import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import Sidebar from "@/app/components/Sidebar";
import Header from "@/app/components/Header";
import HeaderData from "@/app/components/HeaderData";

export const metadata: Metadata = {
  title: "렌트리 애널리틱스 대시보드",
  description: "렌탈사별 매출 추이 및 분석",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
          {/* fallback 도 같은 Header 다 — 제목은 pathname 에서 바로 나오므로 즉시 그려지고,
              Supabase 를 타는 동기화 시각·기준 배지만 나중에 채워진다.
              같은 컴포넌트라 높이가 동일해 레이아웃이 튀지 않는다. */}
          <Suspense fallback={<Header lastUpdated={null} basis={null} />}>
            <HeaderData />
          </Suspense>
          <main className="flex-1 overflow-y-auto bg-white">{children}</main>
        </div>
      </body>
    </html>
  );
}
