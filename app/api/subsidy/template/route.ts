import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

export async function GET() {
  const wb = XLSX.utils.book_new();

  const wsI = XLSX.utils.aoa_to_sheet([
    ["통신사", "상품명", "구분", "업체명", "타사 지원금", "렌트리 지원금"],
  ]);
  XLSX.utils.book_append_sheet(wb, wsI, "인터넷");

  const wsA = XLSX.utils.aoa_to_sheet([
    ["카테고리", "브랜드", "상품명", "모델명", "업체명", "최종 지원금", "더블체크파트너스 지원금"],
  ]);
  XLSX.utils.book_append_sheet(wb, wsA, "가전");

  const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as number[];
  const buf = new Uint8Array(arr);

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="template.xlsx"; filename*=UTF-8''${encodeURIComponent("경쟁사_지원금_조사_템플릿.xlsx")}`,
    },
  });
}
