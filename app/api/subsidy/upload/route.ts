import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type SubsidyRecord = {
  year_month: string;
  type: string;
  category: string | null;
  brand: string | null;
  product_name: string | null;
  model_name: string | null;
  segment: string | null;
  partner: string | null;
  competitor_subsidy: number | null;
  rentree_subsidy: number | null;
  comparison: string | null;
};

function parseNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function deriveComparison(rentree: number | null, competitor: number | null): string | null {
  if (rentree === null || competitor === null) return null;
  if (rentree > competitor) return "우세";
  if (rentree < competitor) return "열세";
  return "동일";
}

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v).trim();
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const yearMonth = formData.get("year_month") as string | null;

    if (!file || !yearMonth) {
      return NextResponse.json(
        { ok: false, error: "file과 year_month가 필요합니다." },
        { status: 400 },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const records: SubsidyRecord[] = [];

    // 시트 이름에 "인터넷" 또는 "가전"이 포함된 시트를 모두 파싱
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

      if (sheetName.includes("인터넷")) {
        for (const row of rows) {
          const rentree = parseNum(row["렌트리 지원금"]);
          const competitor = parseNum(row["타사 지원금"]);
          records.push({
            year_month: yearMonth,
            type: "인터넷",
            category: str(row["통신사"]),
            brand: null,
            product_name: str(row["상품명"]),
            model_name: null,
            segment: str(row["구분"]),
            partner: str(row["업체명"]),
            competitor_subsidy: competitor,
            rentree_subsidy: rentree,
            comparison: str(row["지원금 비교"]) ?? deriveComparison(rentree, competitor),
          });
        }
      } else if (sheetName.includes("가전")) {
        for (const row of rows) {
          const rentree = parseNum(row["더블체크파트너스 지원금"]);
          const competitor = parseNum(row["최종 지원금"]);
          records.push({
            year_month: yearMonth,
            type: "가전",
            category: str(row["카테고리"]),
            brand: str(row["브랜드"]),
            product_name: str(row["상품명"]),
            model_name: str(row["모델명"]),
            segment: null,
            partner: str(row["업체명"]),
            competitor_subsidy: competitor,
            rentree_subsidy: rentree,
            comparison: str(row["지원금 비교"]) ?? deriveComparison(rentree, competitor),
          });
        }
      }
    }

    // 해당 월 데이터 교체
    const { error: delError } = await supabase
      .from("competitive_subsidy")
      .delete()
      .eq("year_month", yearMonth);
    if (delError) throw new Error(JSON.stringify(delError));

    if (records.length > 0) {
      const { error } = await supabase.from("competitive_subsidy").insert(records);
      if (error) throw new Error(JSON.stringify(error));
    }

    return NextResponse.json({ ok: true, inserted: records.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
