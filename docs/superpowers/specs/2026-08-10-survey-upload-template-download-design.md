# 마진분석 엑셀 업로드 템플릿 다운로드 설계

## 배경

`/margin-analysis` 페이지에서 인터넷/유심/가전 경쟁사 조사 엑셀을 업로드하면 `lib/tps/surveyExcelParser.ts` + `app/api/margin-analysis/survey-upload/route.ts`가 정해진 시트명·컬럼명을 기대해 파싱한다. 실제 설문파 팀이 쓰는 기존 표준 양식은 없고, 업로드하는 사람이 매번 코드가 기대하는 컬럼명(통신사/상품명/경쟁사/조사월 등)을 정확히 맞춰야 한다. 형식을 몰라 헤매지 않도록, 코드가 기대하는 컬럼 그대로 빈 템플릿을 내려받을 수 있게 한다.

## 설계 변경 (2026-08-11)

최초 설계는 파서 코드(`extractTpsSurveyRecords`, `extractApplianceSurveyRecords` 등)가 **실제로 읽는** 최소 컬럼만으로 템플릿을 구성했다(인터넷/유심 5개, 가전 6개 컬럼). 사용자가 실제 운영 중인 엑셀 원본(`(biz)인터넷, 가전 조사_최종의 사본.xlsx`)을 공유해 대조한 결과, 실사용 시트는 이보다 훨씬 많은 컬럼을 가지고 있었다:

- 유심: `조사월, 조사업체, 통신사, 상품명, 월요금, 유심상품명, 결합 종류, 구분, 경쟁사, 현금 혜택, 총 지원금\n (최종), 렌트리 지원금` (12개)
- 인터넷: `조사월, 조사업체, 통신사, 상품명, 구분, 경쟁사, 경쟁사 총지원금, 렌트리 지원금` (8개)
- 가전: `조사월, 조사업체, 카테고리, 브랜드, 상품명, 모델명, 경쟁사, 관리방식, 규정, 계약기간, 관리주기, 월 요금, 경쟁사 총지원금` (13개)

파서는 `Record<string, unknown>`으로 전체 컬럼을 다 받아두고 필요한 것만 골라 쓰는 구조라(`lib/tps/surveyExcelParser.ts`), 이 추가 컬럼들이 있어도 파싱 로직은 그대로 동작한다 — **파싱 코드 변경은 불필요**했고, 템플릿만 실제 컬럼 구조(순서 포함)에 맞춰 재작성했다 (`lib/tps/surveyTemplate.ts`). "구분"(예: "인터넷+TV")은 참고용 분류 컬럼으로, 매칭에 쓰이는 "상품명"엔 이미 TV 채널 정보가 포함돼 있어 별도 조합 로직이 필요 없음을 확인했다.

**How to apply:** 이후 이 템플릿을 다시 손볼 일이 있으면, 위 실제 헤더 목록을 기준으로 삼되 실사용 시트가 또 바뀌었을 수 있으니 재확인할 것.

## 목표

- `/margin-analysis` 업로드 영역에서 클릭 한 번으로 템플릿 `.xlsx` 파일을 받을 수 있다
- 템플릿은 파서가 실제로 기대하는 시트명·컬럼명과 100% 일치한다
- 헤더 + 예시 1행으로 작성 방법을 보여준다

## 접근 방식

서버 GET 라우트가 `xlsx`로 워크북을 즉석 생성해 다운로드 응답으로 내려준다. 기존에 `next.config.js`가 `serverExternalPackages: ["xlsx"]`로 이 라이브러리를 서버 전용으로 분리해둔 방향과 일치하고, 헤더/예시값이 전부 TypeScript 코드로 남아 diff로 리뷰할 수 있다 (정적 바이너리 파일을 커밋하는 대안은 리뷰 불가능하고 나중에 컬럼이 바뀌면 수동 재생성이 필요해 채택하지 않음).

## 새 라우트: `app/api/margin-analysis/survey-template/route.ts`

- `GET` 핸들러, 인증/파라미터 없음
- `xlsx.utils.book_new()` + `xlsx.utils.aoa_to_sheet()`로 시트 3개 생성, `xlsx.utils.book_append_sheet()`로 워크북에 추가
- 시트별 헤더 + 예시 1행 (배열의 배열, `SurveyExcelParser`가 실제로 읽는 키와 정확히 동일한 문자열 사용):

  | 시트명 | 헤더 | 예시 행 |
  |---|---|---|
  | `인터넷` | `통신사, 상품명, 경쟁사, 조사월, 경쟁사 총지원금` | `SK 브로드밴드, 000요금제, A업체, 26.04, 50000` |
  | `유심` | `통신사, 상품명, 경쟁사, 조사월, 경쟁사 총지원금` | `KT, 000유심요금제, A업체, 26.04, 30000` |
  | `가전` | `브랜드, 모델명, 경쟁사, 조사월, 계약기간, 경쟁사 총지원금` | `삼성, ABC-123, A업체, 26.04, 24개월, 100000` |

- `xlsx.write(workbook, { type: "buffer", bookType: "xlsx" })`로 버퍼 생성
- 응답: `new NextResponse(buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="survey-template.xlsx"' } })`

## UI 변경 (`MarginAnalysisClient.tsx`)

- 업로드 `<input type="file">` 옆(현재 파일의 601~604줄 부근)에 텍스트 링크 추가:
  ```tsx
  <a href={`${BASE_PATH}/api/margin-analysis/survey-template`} className="text-xs text-blue-600 hover:underline">
    템플릿 다운로드
  </a>
  ```
- `BASE_PATH`는 이미 이 파일에 정의돼 있는 상수를 그대로 사용 (fetch와 동일하게, 일반 `<a href>`도 Next.js `basePath`가 자동으로 붙지 않으므로 직접 접두어를 붙여야 함)

## 에러 처리

- 파라미터가 없는 정적 생성이라 실패할 입력 조건이 없음 — 별도 에러 처리 불필요
- `xlsx.write`가 예외를 던지는 경우는 없다고 가정 (라이브러리 자체 버그 수준이라 방어 코드 추가하지 않음)

## 테스트 계획

1. `npx tsc --noEmit` — 타입 체크 통과 확인
2. 로컬에서 `GET /api/margin-analysis/survey-template` 직접 호출해 응답이 유효한 `.xlsx`인지 확인 (다운로드 후 엑셀/Numbers로 열어 시트 3개·헤더·예시행 확인)
3. `/margin-analysis` 페이지에서 "템플릿 다운로드" 링크 클릭 → 파일 다운로드되는지 확인
4. 받은 템플릿에 실제 값을 채워 넣고 업로드 → `survey-upload` API가 정상 파싱하는지 확인 (헤더가 파서 기대값과 정확히 일치하는지의 최종 검증)

## 범위 밖 (Out of Scope)

- 템플릿에 실제 `products` 카탈로그 기반 드롭다운/유효성 검사(엑셀 데이터 검증 규칙) 추가
- 시트별 안내문/설명 행 추가
- 기존 실사용 엑셀 양식과의 병합 (그런 기존 양식이 없다는 전제)
