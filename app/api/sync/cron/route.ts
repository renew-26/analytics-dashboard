import { NextResponse } from "next/server";

export const maxDuration = 300;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  // 어제부터 오늘까지만 fetch (누적 데이터 중 신규분만)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      startDate: yesterday,
      endDate: today,
      dataType: "계약완료",
    }),
  });

  const result = await res.json();
  return NextResponse.json(result);
}
