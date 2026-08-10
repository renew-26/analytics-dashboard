import * as XLSX from "xlsx";

interface TemplateSheet {
  name: string;
  rows: (string | number)[][];
}

export const SURVEY_TEMPLATE_SHEETS: TemplateSheet[] = [
  {
    name: "인터넷",
    rows: [
      ["통신사", "상품명", "경쟁사", "조사월", "경쟁사 총지원금"],
      ["SK 브로드밴드", "000요금제", "A업체", 26.04, 50000],
    ],
  },
  {
    name: "유심",
    rows: [
      ["통신사", "상품명", "경쟁사", "조사월", "경쟁사 총지원금"],
      ["KT", "000유심요금제", "A업체", 26.04, 30000],
    ],
  },
  {
    name: "가전",
    rows: [
      ["브랜드", "모델명", "경쟁사", "조사월", "계약기간", "경쟁사 총지원금"],
      ["삼성", "ABC-123", "A업체", 26.04, "24개월", 100000],
    ],
  },
];

export function buildSurveyTemplateWorkbookBuffer(): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const sheet of SURVEY_TEMPLATE_SHEETS) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
