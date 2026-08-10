import { NextResponse } from "next/server";
import { buildSurveyTemplateWorkbookBuffer } from "@/lib/tps/surveyTemplate";

export async function GET() {
  const buffer = buildSurveyTemplateWorkbookBuffer();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="survey-template.xlsx"',
    },
  });
}
