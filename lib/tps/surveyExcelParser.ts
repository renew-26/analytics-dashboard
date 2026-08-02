import * as XLSX from "xlsx";

const CATEGORIES = ["인터넷", "유심", "가전"];

export interface SurveyRow extends Record<string, unknown> {
  survey_year: number;
  survey_month: number;
}

function normalizeSheetCategory(sheetName: string): string | null {
  if (sheetName.includes("사본")) return null;
  for (const cat of CATEGORIES) {
    if (sheetName.includes(cat)) return cat;
  }
  return null;
}

// '조사월' 값(예: 26.04, 26.05)을 {survey_year, survey_month}로 변환한다.
// 엑셀/JS 부동소수점 특성상 26.05는 내부적으로 26.049999999999997로 저장될 수 있어
// Math.round로 보정한다. 26.1과 26.10은 부동소수점상 완전히 같은 값이므로 표기와 무관하게
// 동일하게 처리된다 — 두자리 월 관례(04, 05, ...10)가 깨지면(예: 26.4) 잘못된 월(40)이
// 나올 수 있으므로 1~12 범위를 벗어나면 null을 반환해 해당 행을 버린다.
export function parseSurveyPeriod(value: unknown): { survey_year: number; survey_month: number } | null {
  const num = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(num)) return null;

  const survey_year = 2000 + Math.floor(num);
  const survey_month = Math.round((num - Math.floor(num)) * 100);
  if (survey_month < 1 || survey_month > 12) return null;

  return { survey_year, survey_month };
}

export function parseSurveyExcel(buffer: ArrayBuffer): Record<string, SurveyRow[]> {
  const workbook = XLSX.read(buffer, { type: "array" });
  const result: Record<string, SurveyRow[]> = {};

  for (const sheetName of workbook.SheetNames) {
    const category = normalizeSheetCategory(sheetName);
    if (!category || result[category]) continue;

    const sheet = workbook.Sheets[sheetName];
    const allRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    if (allRows.length < 2) continue;

    // 최종 정리 시트는 안내문 행이 없고 헤더가 바로 1행(0-indexed 0)이다 — 옛 raw 포맷(헤더 2행)과 다르다.
    const headers = (allRows[0] ?? []).map(h => (h === null ? "" : String(h)));
    const data: SurveyRow[] = [];

    for (const row of allRows.slice(1)) {
      if (row.every(v => v === null || v === undefined)) continue;
      const record: Record<string, unknown> = {};
      headers.forEach((h, i) => { record[h] = row[i] ?? null; });

      const period = parseSurveyPeriod(record["조사월"]);
      if (!period) continue;

      data.push({ ...record, ...period });
    }

    if (data.length > 0) result[category] = data;
  }

  return result;
}
