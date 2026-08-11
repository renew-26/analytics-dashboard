import * as XLSX from "xlsx";

interface TemplateSheet {
  name: string;
  rows: (string | number)[][];
}

export const SURVEY_TEMPLATE_SHEETS: TemplateSheet[] = [
  {
    name: "유심",
    rows: [
      ["조사월", "조사업체", "통신사", "상품명", "월요금", "유심상품명", "결합 종류", "구분", "경쟁사", "현금 혜택", "총 지원금\n (최종)", "렌트리 지원금"],
      ["26.04 형식", "테스트업체", "KT", "000요금제", 80000, "000유심", "싱글결합", "유심+인터넷", "A업체", 30000, 60000, 40000],
    ],
  },
  {
    name: "인터넷",
    rows: [
      ["조사월", "조사업체", "통신사", "상품명", "구분", "경쟁사", "경쟁사 총지원금", "렌트리 지원금"],
      ["26.04 형식", "테스트업체", "SK 브로드밴드", "000요금제", "인터넷", "A업체", 50000, 60000],
    ],
  },
  {
    name: "가전",
    rows: [
      ["조사월", "조사업체", "카테고리", "브랜드", "상품명", "모델명", "경쟁사", "관리방식", "규정", "계약기간", "관리주기", "월 요금", "경쟁사 총지원금"],
      ["26.04 형식", "테스트업체", "공기청정기", "삼성", "000 공기청정기", "ABC-123", "A업체", "자가(셀프) 관리", "일반", 36, 12, 20000, 100000],
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
