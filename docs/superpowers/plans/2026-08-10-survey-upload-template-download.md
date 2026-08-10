# 마진분석 엑셀 업로드 템플릿 다운로드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/margin-analysis` 업로드 영역에서 클릭 한 번으로, 파서가 실제로 기대하는 시트명·컬럼명과 100% 일치하는 빈 엑셀 템플릿(`.xlsx`)을 내려받을 수 있게 한다.

**Architecture:** 순수 워크북 생성 로직을 `lib/tps/surveyTemplate.ts`에 두고(테스트 가능, Next.js 런타임 의존 없음), `app/api/margin-analysis/survey-template/route.ts`는 이를 호출해 다운로드 응답으로 감싸는 얇은 GET 핸들러로 둔다. `MarginAnalysisClient.tsx`에 이 라우트로 향하는 `<a href>` 링크를 추가한다.

**Tech Stack:** Next.js 16 App Router route handler, `xlsx` (이미 의존성에 있음, `serverExternalPackages`로 서버 전용 지정됨).

## Global Constraints

- 이 저장소에는 자동화 테스트 러너(jest/vitest 등)가 없다 — `AGENTS.md`의 "Testing Requirements"대로 `npm run dev` 로컬 확인 + `npm run build` 빌드 확인이 검증 방법이다. 각 태스크의 "테스트" 단계는 이 방식(수동 curl + 일회성 Node 검증 스크립트)을 따른다.
- 시트/컬럼명은 스펙에서 정한 값과 **문자 그대로** 일치해야 한다: 인터넷/유심 = `통신사, 상품명, 경쟁사, 조사월, 경쟁사 총지원금` / 가전 = `브랜드, 모델명, 경쟁사, 조사월, 계약기간, 경쟁사 총지원금` (`lib/tps/surveyExcelParser.ts`, `app/api/margin-analysis/survey-upload/route.ts:60-115` 참고).
- `xlsx`는 `next.config.js`의 `serverExternalPackages: ["xlsx"]`로 서버 전용 지정되어 있다 — 클라이언트 컴포넌트(`MarginAnalysisClient.tsx`)에서 절대 `import`하지 않는다.
- `MarginAnalysisClient.tsx`에는 이미 `const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || ''`가 정의되어 있다(파일 상단) — 새 링크의 href에도 이 상수를 그대로 재사용한다. 새로 선언하지 않는다.
- Content-Type은 `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition`은 `attachment; filename="survey-template.xlsx"` 로 고정한다.

---

### Task 1: 템플릿 워크북 생성 라이브러리 + 다운로드 라우트

**Files:**
- Create: `lib/tps/surveyTemplate.ts`
- Create: `app/api/margin-analysis/survey-template/route.ts`

**Interfaces:**
- Produces: `buildSurveyTemplateWorkbookBuffer(): Buffer` — 인터넷/유심/가전 3개 시트(헤더+예시 1행)가 담긴 `.xlsx` 바이너리를 반환. Task 2에서는 이 함수를 쓰지 않지만(라우트는 GET만 노출), 향후 재사용 가능하도록 export한다.

- [ ] **Step 1: `lib/tps/surveyTemplate.ts` 작성**

```ts
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
```

- [ ] **Step 2: `app/api/margin-analysis/survey-template/route.ts` 작성**

```ts
import { NextResponse } from "next/server";
import { buildSurveyTemplateWorkbookBuffer } from "@/lib/tps/surveyTemplate";

export async function GET() {
  const buffer = buildSurveyTemplateWorkbookBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="survey-template.xlsx"',
    },
  });
}
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit -p .`
Expected: 에러 없음 (기존에 있던 에러가 없다면 출력 없이 종료)

- [ ] **Step 4: dev 서버 기동 확인**

Run: `npm run dev` (백그라운드로 실행)
Expected: `✓ Ready in ...` 로그, 포트 3000에서 리슨

- [ ] **Step 5: 라우트를 직접 호출해 파일 저장**

Run: `curl -s -D /tmp/template-headers.txt http://localhost:3000/api/margin-analysis/survey-template -o /tmp/survey-template.xlsx && cat /tmp/template-headers.txt`
Expected: `HTTP/1.1 200 OK`, `content-type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `content-disposition: attachment; filename="survey-template.xlsx"`. `/tmp/survey-template.xlsx` 파일 크기가 0보다 큼.

- [ ] **Step 6: 저장된 파일이 기대한 시트/헤더를 담고 있는지 일회성 스크립트로 검증**

이 저장소엔 테스트 러너가 없고 `tsx`/`ts-node`도 설치돼 있지 않다. `xlsx` 패키지는 `"module": "xlsx.mjs"`를 지원해 plain Node(ESM)에서 바로 `import`할 수 있으므로, 순수 JS 검증 스크립트를 리포 루트에 **임시로** 만들어 프로젝트의 `node_modules` 해석 범위 안에서 실행한 뒤 지운다 (커밋하지 않음).

파일: `verify-survey-template.mjs` (리포 루트, 임시)

```js
import * as XLSX from "xlsx";

const wb = XLSX.readFile("/tmp/survey-template.xlsx");

const expected = {
  "인터넷": ["통신사", "상품명", "경쟁사", "조사월", "경쟁사 총지원금"],
  "유심": ["통신사", "상품명", "경쟁사", "조사월", "경쟁사 총지원금"],
  "가전": ["브랜드", "모델명", "경쟁사", "조사월", "계약기간", "경쟁사 총지원금"],
};

const actualNames = wb.SheetNames;
const expectedNames = Object.keys(expected);
if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
  throw new Error(`시트 이름 불일치: ${JSON.stringify(actualNames)} !== ${JSON.stringify(expectedNames)}`);
}

for (const [name, headers] of Object.entries(expected)) {
  const sheet = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const actualHeaders = rows[0];
  if (JSON.stringify(actualHeaders) !== JSON.stringify(headers)) {
    throw new Error(`[${name}] 헤더 불일치: ${JSON.stringify(actualHeaders)} !== ${JSON.stringify(headers)}`);
  }
  if (rows.length < 2) {
    throw new Error(`[${name}] 예시 행이 없음`);
  }
}

console.log("PASS: 시트 3개, 헤더 모두 일치, 예시 행 존재");
```

Run: `node verify-survey-template.mjs`

Expected: `PASS: 시트 3개, 헤더 모두 일치, 예시 행 존재` 출력. (Step 1~2 구현 전에 이 스크립트를 먼저 돌리면 `/tmp/survey-template.xlsx`가 없어 `ENOENT`로 실패하는 것이 자연스러운 RED 상태다 — 구현 후 재실행이 GREEN.)

- [ ] **Step 7: 임시 검증 스크립트 삭제, dev 서버 종료**

Run: `rm verify-survey-template.mjs` (커밋 대상에 남지 않도록), 그리고 Step 4에서 백그라운드로 띄운 dev 서버 프로세스 종료

- [ ] **Step 8: Commit**

```bash
git add lib/tps/surveyTemplate.ts app/api/margin-analysis/survey-template/route.ts
git commit -m "feat: 마진분석 조사 엑셀 업로드 템플릿 다운로드 라우트 추가"
```

---

### Task 2: 업로드 화면에 템플릿 다운로드 링크 추가

**Files:**
- Modify: `app/components/tps/MarginAnalysisClient.tsx` (업로드 `<input type="file">` 근처, 현재 601~604줄)

**Interfaces:**
- Consumes: Task 1에서 만든 `GET /api/margin-analysis/survey-template` 라우트 (URL 경로만 필요, import 없음). 파일 상단에 이미 있는 `const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || ''` (line 12 부근)를 사용.

- [ ] **Step 1: 파일에서 현재 업로드 input 블록 확인**

Run: `grep -n "input type=\"file\"" app/components/tps/MarginAnalysisClient.tsx`
Expected: `603:          <input type="file" accept=".xlsx" disabled={uploading} onChange={e => setUploadFile(e.target.files?.[0] ?? null)}` 한 줄 출력

- [ ] **Step 2: 링크 추가**

`app/components/tps/MarginAnalysisClient.tsx`의 아래 블록:

```tsx
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" accept=".xlsx" disabled={uploading} onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
            className="text-xs" title="최종 정리 시트 (유심/인터넷/가전)" />
          <button onClick={handleSurveyUpload} disabled={uploading}
```

를 아래로 교체:

```tsx
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" accept=".xlsx" disabled={uploading} onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
            className="text-xs" title="최종 정리 시트 (유심/인터넷/가전)" />
          <a href={`${BASE_PATH}/api/margin-analysis/survey-template`}
            className="text-xs text-blue-600 hover:underline">
            템플릿 다운로드
          </a>
          <button onClick={handleSurveyUpload} disabled={uploading}
```

(뒤에 이어지는 `disabled` 이후 줄들은 그대로 둔다 — `<button>` 블록 자체는 변경하지 않음)

- [ ] **Step 3: 타입체크 + 남은 bare `/api` fetch 없는지 재확인**

Run: `npx tsc --noEmit -p . && grep -n "href=\"/api\|href='/api" app/components/tps/MarginAnalysisClient.tsx; echo "exit:$?"`
Expected: tsc 에러 없음. grep은 매치 없음 → `exit:1` (즉 `BASE_PATH` 접두어 없이 하드코딩된 href가 없음)

- [ ] **Step 4: 링크 위치 시각 확인 + 실제 업로드 라운드트립 확인 (Supabase/Redash 자격증명 있는 환경에서만)**

로컬에 Supabase 자격증명이 없어 `/margin-analysis` 페이지 자체가 500이 나는 환경이라면 이 단계는 건너뛰고, 자격증명이 있는 환경(배포 환경 또는 `.env` 채워진 로컬)에서 다음을 확인한다:
1. `/margin-analysis` 접속 → 업로드 input 옆에 "템플릿 다운로드" 링크가 보이는지, 클릭 시 `survey-template.xlsx`가 다운로드되는지
2. 받은 템플릿의 예시 행을 실제 `products` 테이블에 존재하는 통신사/상품명(또는 브랜드/모델명+계약기간)으로 바꿔 채운 뒤 "업로드 및 비교" 클릭 → `survey-upload` API가 정상 파싱해 매칭 결과를 반환하는지 확인 (헤더가 파서 기대값과 정확히 일치하는지의 최종 검증 — 스펙 "테스트 계획" 4번)

- [ ] **Step 5: Commit**

```bash
git add app/components/tps/MarginAnalysisClient.tsx
git commit -m "feat: 업로드 화면에 조사 엑셀 템플릿 다운로드 링크 추가"
```

## Out of Scope (스펙과 동일)

- 템플릿에 `products` 카탈로그 기반 드롭다운/데이터 검증 규칙 추가
- 시트별 안내문/설명 행 추가
- 기존 실사용 엑셀 양식과의 병합
