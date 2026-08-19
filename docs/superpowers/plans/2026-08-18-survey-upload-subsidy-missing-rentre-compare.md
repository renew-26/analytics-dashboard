# 지원금 미입력 항목에 렌트리 현재 지원금 비교 표시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 조사 파일 업로드 시 "지원금 미입력"으로 분류된 행도 렌트리 상품과 매칭시켜, 매칭된 상품의 렌트리 현재 지원금을 미입력 패널에 함께 표시한다.

**Architecture:** `app/api/margin-analysis/survey-upload/route.ts`의 인터넷/유심/가전 3개 루프에서 상품 매칭 호출(`buildCompetitorRecordFromTps`/`buildCompetitorRecordFromAppliance`)을 `subsidy_missing` 분기보다 먼저 실행하도록 순서만 바꾼다. 매칭되면 기존에 이미 로드되어 있는 렌트리 지원금 소스(TPS/유심: `products.effective_subsidy`, 가전: `appliance_rentre_subsidy` 스냅샷)에서 값을 조회해 `subsidyMissingOut` 항목에 `rentreSubsidy` 필드로 붙인다. 프런트엔드(`MarginAnalysisClient.tsx`)는 이 값을 미입력 패널의 새 열에 표시한다.

**Tech Stack:** Next.js 16 API Route (TypeScript), React 19 Client Component, Supabase JS. 이 저장소에는 단위 테스트 러너(Vitest/Jest)가 구성되어 있지 않다 (`AGENTS.md` 테스트 요구사항: `npm run dev`/`npm run build`/`npm run lint`만 사용) — 이 관례를 그대로 따르고, 각 태스크는 타입체크(`npm run build`)·린트(`npm run lint`) 통과와 수동 확인으로 검증한다. 새 테스트 프레임워크를 추가하지 않는다.

## Global Constraints

- 지원금 미입력 행은 `competitor_subsidies` 테이블에 저장하지 않는다 — 이번 업로드 응답 안에서만 표시되는 일회성 데이터로 유지한다.
- 렌트리 현재 지원금은 margin-analysis가 이미 쓰는 소스만 재사용한다: TPS/유심 = `products.effective_subsidy`, 가전 = `appliance_rentre_subsidy.doublecheck_subsidy`. survey-selection(Q4657/Q4671) 라이브 소스는 쓰지 않는다.
- 매칭 실패와 "매칭됐지만 렌트리 지원금 데이터 없음"을 구분하지 않는다 — 둘 다 `rentreSubsidy: null`로 표현하고, UI에서는 동일하게 "렌트리 매칭 안 됨"으로 표시한다.
- 인터넷/유심/가전 3개 카테고리 모두 동일한 방식을 적용한다.
- 금액 포맷은 기존 `formatKRW` 헬퍼(`MarginAnalysisClient.tsx:34`)를 그대로 재사용한다 — 새 포맷 함수를 만들지 않는다.

---

## Task 1: 인터넷/유심 루프 — 렌트리 지원금 조회 준비 + 매칭 순서 변경

**Files:**
- Modify: `app/api/margin-analysis/survey-upload/route.ts:31-45` (`fetchAllActiveProducts`)
- Modify: `app/api/margin-analysis/survey-upload/route.ts:140-211` (상태 선언, 인터넷/유심 루프)

**Interfaces:**
- Consumes: 기존 `buildCompetitorRecordFromTps(entry, tpsProducts, surveyYear, surveyMonth): { record: CompetitorSubsidyInsert | null; matched: boolean }` (`lib/tps/competitorSync.ts:82`), `CompetitorSubsidyInsert.product_id: string | null`.
- Produces: `tpsEffectiveSubsidyById: Map<string, number | null>` — Task 3(프런트엔드)는 이 맵에서 나온 값이 `subsidyMissingOut` 각 항목의 `rentreSubsidy: number | null` 필드로 들어간다는 것만 알면 되고, 맵 자체를 직접 쓰지 않는다.

### Step 1: `fetchAllActiveProducts`의 select에 `effective_subsidy` 추가

`app/api/margin-analysis/survey-upload/route.ts:31-45`, 현재:

```ts
async function fetchAllActiveProducts(category: string) {
  const rows = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("products")
      .select("id, telecom, name, model_number, brand, contract_period")
      .eq("category", category)
      .eq("is_active", true)
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}
```

다음과 같이 select 문자열만 바꾼다:

```ts
async function fetchAllActiveProducts(category: string) {
  const rows = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("products")
      .select("id, telecom, name, model_number, brand, contract_period, effective_subsidy")
      .eq("category", category)
      .eq("is_active", true)
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}
```

- [ ] 위와 같이 수정

### Step 2: `tpsProducts` 구성부에서 원본 배열을 보관하고 `tpsEffectiveSubsidyById` 맵 생성

`app/api/margin-analysis/survey-upload/route.ts:145-150`, 현재:

```ts
    const needsTpsProducts = Boolean(sheets["인터넷"] || sheets["유심"]);
    const tpsProducts: TpsProductLookup[] = needsTpsProducts
      ? (await fetchAllActiveProducts("tps"))
          .filter(p => p.telecom && p.name)
          .map(p => ({ id: p.id, telecom: p.telecom as string, name: p.name }))
      : [];
```

다음으로 교체:

```ts
    const needsTpsProducts = Boolean(sheets["인터넷"] || sheets["유심"]);
    const tpsProductsRaw = needsTpsProducts ? await fetchAllActiveProducts("tps") : [];
    const tpsProducts: TpsProductLookup[] = tpsProductsRaw
      .filter(p => p.telecom && p.name)
      .map(p => ({ id: p.id, telecom: p.telecom as string, name: p.name }));
    const tpsEffectiveSubsidyById = new Map(
      tpsProductsRaw.map(p => [p.id, p.effective_subsidy as number | null])
    );
```

- [ ] 위와 같이 수정

### Step 3: 인터넷 루프 — 매칭을 `subsidy_missing` 체크보다 먼저 실행

`app/api/margin-analysis/survey-upload/route.ts:152-184`, 현재:

```ts
    if (sheets["인터넷"]) {
      for (const entry of extractTpsSurveyRecords(sheets["인터넷"])) {
        if (entry.subsidy_missing) {
          subsidyMissingOut.push({ ...entry, category: "tps" });
          continue;
        }
        const { record, matched } = buildCompetitorRecordFromTps(entry, tpsProducts, entry.survey_year, entry.survey_month);
        if (matched && record) {
          records.push(record);
          const key = buildTpsIdentityKey({ telecom: tpsProducts.find(p => p.id === record.product_id)!.telecom, name: entry.model_name });
          const commission = tpsCommissionLookup.get(key);
          if (commission) {
            marginEstimates.push({
              partner_name: entry.partner_name,
              product_name: entry.model_name,
              commission,
              marginRate: calcEstimatedCompetitorMarginRate({
                commission, badDebtRate: tpsBadDebtRate,
                competitorSubsidy: entry.subsidy, badDebtApplicable: record.bad_debt_applicable,
              }),
              subsidy_estimated: entry.subsidy_estimated,
            });
          }
        } else {
          records.push(buildUnmatchedCompetitorRecord({ ...entry, model_number: entry.model_name }, "tps", entry.survey_year, entry.survey_month));
          const targetTelecomCode = LABEL_TO_TELECOM[entry.telecom] ?? entry.telecom;
          const suggestions = suggestSimilarProducts(
            entry.model_name,
            tpsProducts.filter(p => p.telecom === targetTelecomCode).map(p => ({ id: p.id, name: p.name, brand: null, contractPeriod: null })),
          );
          unmatchedOut.push({ ...entry, category: "tps", reason: "no_product_match", suggestions });
        }
      }
    }
```

다음으로 교체 (matched/else 분기 내부는 그대로 두고, `if (entry.subsidy_missing)` 블록만 앞으로 옮기고 내용을 바꾼다):

```ts
    if (sheets["인터넷"]) {
      for (const entry of extractTpsSurveyRecords(sheets["인터넷"])) {
        const { record, matched } = buildCompetitorRecordFromTps(entry, tpsProducts, entry.survey_year, entry.survey_month);
        if (entry.subsidy_missing) {
          const rentreSubsidy = matched && record?.product_id
            ? tpsEffectiveSubsidyById.get(record.product_id) ?? null
            : null;
          subsidyMissingOut.push({ ...entry, category: "tps", rentreSubsidy });
          continue;
        }
        if (matched && record) {
          records.push(record);
          const key = buildTpsIdentityKey({ telecom: tpsProducts.find(p => p.id === record.product_id)!.telecom, name: entry.model_name });
          const commission = tpsCommissionLookup.get(key);
          if (commission) {
            marginEstimates.push({
              partner_name: entry.partner_name,
              product_name: entry.model_name,
              commission,
              marginRate: calcEstimatedCompetitorMarginRate({
                commission, badDebtRate: tpsBadDebtRate,
                competitorSubsidy: entry.subsidy, badDebtApplicable: record.bad_debt_applicable,
              }),
              subsidy_estimated: entry.subsidy_estimated,
            });
          }
        } else {
          records.push(buildUnmatchedCompetitorRecord({ ...entry, model_number: entry.model_name }, "tps", entry.survey_year, entry.survey_month));
          const targetTelecomCode = LABEL_TO_TELECOM[entry.telecom] ?? entry.telecom;
          const suggestions = suggestSimilarProducts(
            entry.model_name,
            tpsProducts.filter(p => p.telecom === targetTelecomCode).map(p => ({ id: p.id, name: p.name, brand: null, contractPeriod: null })),
          );
          unmatchedOut.push({ ...entry, category: "tps", reason: "no_product_match", suggestions });
        }
      }
    }
```

- [ ] 위와 같이 수정

### Step 4: 유심 루프 — 동일한 방식 적용

`app/api/margin-analysis/survey-upload/route.ts:187-211`, 현재:

```ts
    if (sheets["유심"]) {
      for (const entry of extractTpsSurveyRecords(sheets["유심"])) {
        if (entry.subsidy_missing) {
          subsidyMissingOut.push({ ...entry, category: "usim" });
          continue;
        }
        const { record, matched } = buildCompetitorRecordFromTps(entry, tpsProducts, entry.survey_year, entry.survey_month);
        if (matched && record) {
          // 유심 결합 지원금은 별도 카테고리로 저장한다 — 같은 tps 상품이라도 인터넷 단독
          // 지원금과는 다른 조사 대상이라 하나로 평균내면 안 된다.
          records.push({ ...record, category: "usim" });
          // TPS 커미션(견적)은 유심 결합 여부에 따라 달라지는데 Redash #4622는 상품 단위로만
          // 구분되어 유심 결합분과 1:1 대응이 불명확하므로, marginEstimates는 인터넷 시트
          // 매칭분만 계산한다.
        } else {
          records.push(buildUnmatchedCompetitorRecord({ ...entry, model_number: entry.model_name }, "usim", entry.survey_year, entry.survey_month));
          const targetTelecomCode = LABEL_TO_TELECOM[entry.telecom] ?? entry.telecom;
          const suggestions = suggestSimilarProducts(
            entry.model_name,
            tpsProducts.filter(p => p.telecom === targetTelecomCode).map(p => ({ id: p.id, name: p.name, brand: null, contractPeriod: null })),
          );
          unmatchedOut.push({ ...entry, category: "usim", reason: "no_product_match", suggestions });
        }
      }
    }
```

다음으로 교체:

```ts
    if (sheets["유심"]) {
      for (const entry of extractTpsSurveyRecords(sheets["유심"])) {
        const { record, matched } = buildCompetitorRecordFromTps(entry, tpsProducts, entry.survey_year, entry.survey_month);
        if (entry.subsidy_missing) {
          const rentreSubsidy = matched && record?.product_id
            ? tpsEffectiveSubsidyById.get(record.product_id) ?? null
            : null;
          subsidyMissingOut.push({ ...entry, category: "usim", rentreSubsidy });
          continue;
        }
        if (matched && record) {
          // 유심 결합 지원금은 별도 카테고리로 저장한다 — 같은 tps 상품이라도 인터넷 단독
          // 지원금과는 다른 조사 대상이라 하나로 평균내면 안 된다.
          records.push({ ...record, category: "usim" });
          // TPS 커미션(견적)은 유심 결합 여부에 따라 달라지는데 Redash #4622는 상품 단위로만
          // 구분되어 유심 결합분과 1:1 대응이 불명확하므로, marginEstimates는 인터넷 시트
          // 매칭분만 계산한다.
        } else {
          records.push(buildUnmatchedCompetitorRecord({ ...entry, model_number: entry.model_name }, "usim", entry.survey_year, entry.survey_month));
          const targetTelecomCode = LABEL_TO_TELECOM[entry.telecom] ?? entry.telecom;
          const suggestions = suggestSimilarProducts(
            entry.model_name,
            tpsProducts.filter(p => p.telecom === targetTelecomCode).map(p => ({ id: p.id, name: p.name, brand: null, contractPeriod: null })),
          );
          unmatchedOut.push({ ...entry, category: "usim", reason: "no_product_match", suggestions });
        }
      }
    }
```

- [ ] 위와 같이 수정

### Step 5: 타입 체크

Run: `npm run build`
Expected: 컴파일 에러 없이 빌드 성공 (`tpsProductsRaw`, `tpsEffectiveSubsidyById`가 정상적으로 타입 추론됨).

- [ ] 실행 후 성공 확인

### Step 6: 린트

Run: `npm run lint`
Expected: 에러 없음.

- [ ] 실행 후 성공 확인

### Step 7: 커밋

```bash
git add app/api/margin-analysis/survey-upload/route.ts
git commit -m "feat: 인터넷/유심 지원금 미입력 행도 렌트리 상품 매칭 후 렌트리 지원금 조회"
```

- [ ] 커밋 완료

---

## Task 2: 가전 루프 — 매칭 순서 변경 + 스냅샷 조회

**Files:**
- Modify: `app/api/margin-analysis/survey-upload/route.ts:213-252`

**Interfaces:**
- Consumes: 기존 `buildCompetitorRecordFromAppliance(row, applianceProducts, surveyYear, surveyMonth): { record: CompetitorSubsidyInsert | null; matched: boolean }` (`lib/tps/competitorSync.ts:33`), 이미 함수 상단(139행 부근)에서 로드된 `applianceSnapshotLookup: Map<string, ApplianceSnapshotValue>` (`lib/tps/applianceRentreSubsidy.ts`), `ApplianceSnapshotValue.doublecheckSubsidy: number`.
- Produces: `subsidyMissingOut` 가전 항목에 `rentreSubsidy: number | null` 필드 (Task 1과 동일한 필드명·의미).

### Step 1: 가전 루프 재구성

`app/api/margin-analysis/survey-upload/route.ts:213-252`, 현재:

```ts
    if (sheets["가전"]) {
      const productsRaw = await fetchAllActiveProducts("appliance");
      const applianceProducts: ProductLookup[] = productsRaw.map(p => ({
        id: p.id, modelNumber: p.model_number, name: p.name, brand: p.brand, contractPeriod: p.contract_period,
      }));

      for (const entry of extractApplianceSurveyRecords(sheets["가전"])) {
        if (entry.subsidy_missing) {
          subsidyMissingOut.push({ ...entry, category: "appliance" });
          continue;
        }
        const row = { "모델명": entry.model_number, "파트너사": entry.partner_name, "브랜드명": entry.brand, "지원금": entry.subsidy, "제품 카테고리": "appliance", "계약기간": entry.contract_period };
        const { record, matched } = buildCompetitorRecordFromAppliance(row, applianceProducts, entry.survey_year, entry.survey_month);
        if (matched && record) {
          records.push(record);
          const snapshot = applianceSnapshotLookup.get(record.product_id!);
          if (snapshot) {
            marginEstimates.push({
              partner_name: entry.partner_name,
              product_name: entry.model_number,
              commission: snapshot.doublecheckCommission,
              marginRate: calcEstimatedCompetitorMarginRate({
                commission: snapshot.doublecheckCommission, badDebtRate: applianceBadDebtRate,
                competitorSubsidy: entry.subsidy, badDebtApplicable: record.bad_debt_applicable,
              }),
              subsidy_estimated: entry.subsidy_estimated,
            });
          }
        } else {
          records.push(buildUnmatchedCompetitorRecord(entry, "appliance", entry.survey_year, entry.survey_month));
          const suggestions = suggestSimilarProducts(
            entry.model_number,
            applianceProducts
              .filter(p => !entry.brand || p.brand === entry.brand)
              .map(p => ({ id: p.id, name: p.modelNumber ?? p.name, brand: p.brand, contractPeriod: p.contractPeriod })),
          );
          unmatchedOut.push({ ...entry, category: "appliance", reason: "no_product_match", suggestions });
        }
      }
    }
```

다음으로 교체 (`row`/매칭 호출을 `subsidy_missing` 체크보다 앞으로 옮긴다):

```ts
    if (sheets["가전"]) {
      const productsRaw = await fetchAllActiveProducts("appliance");
      const applianceProducts: ProductLookup[] = productsRaw.map(p => ({
        id: p.id, modelNumber: p.model_number, name: p.name, brand: p.brand, contractPeriod: p.contract_period,
      }));

      for (const entry of extractApplianceSurveyRecords(sheets["가전"])) {
        const row = { "모델명": entry.model_number, "파트너사": entry.partner_name, "브랜드명": entry.brand, "지원금": entry.subsidy, "제품 카테고리": "appliance", "계약기간": entry.contract_period };
        const { record, matched } = buildCompetitorRecordFromAppliance(row, applianceProducts, entry.survey_year, entry.survey_month);
        if (entry.subsidy_missing) {
          const snapshot = matched && record?.product_id ? applianceSnapshotLookup.get(record.product_id) : undefined;
          subsidyMissingOut.push({ ...entry, category: "appliance", rentreSubsidy: snapshot?.doublecheckSubsidy ?? null });
          continue;
        }
        if (matched && record) {
          records.push(record);
          const snapshot = applianceSnapshotLookup.get(record.product_id!);
          if (snapshot) {
            marginEstimates.push({
              partner_name: entry.partner_name,
              product_name: entry.model_number,
              commission: snapshot.doublecheckCommission,
              marginRate: calcEstimatedCompetitorMarginRate({
                commission: snapshot.doublecheckCommission, badDebtRate: applianceBadDebtRate,
                competitorSubsidy: entry.subsidy, badDebtApplicable: record.bad_debt_applicable,
              }),
              subsidy_estimated: entry.subsidy_estimated,
            });
          }
        } else {
          records.push(buildUnmatchedCompetitorRecord(entry, "appliance", entry.survey_year, entry.survey_month));
          const suggestions = suggestSimilarProducts(
            entry.model_number,
            applianceProducts
              .filter(p => !entry.brand || p.brand === entry.brand)
              .map(p => ({ id: p.id, name: p.modelNumber ?? p.name, brand: p.brand, contractPeriod: p.contractPeriod })),
          );
          unmatchedOut.push({ ...entry, category: "appliance", reason: "no_product_match", suggestions });
        }
      }
    }
```

- [ ] 위와 같이 수정

### Step 2: 타입 체크

Run: `npm run build`
Expected: 빌드 성공.

- [ ] 실행 후 성공 확인

### Step 3: 린트

Run: `npm run lint`
Expected: 에러 없음.

- [ ] 실행 후 성공 확인

### Step 4: 커밋

```bash
git add app/api/margin-analysis/survey-upload/route.ts
git commit -m "feat: 가전 지원금 미입력 행도 렌트리 상품 매칭 후 렌트리 지원금 조회"
```

- [ ] 커밋 완료

---

## Task 3: 프런트엔드 — 지원금 미입력 패널에 렌트리 지원금 열 추가

**Files:**
- Modify: `app/components/tps/MarginAnalysisClient.tsx:630-645`

**Interfaces:**
- Consumes: `subsidyMissing: Record<string, unknown>[]` state (기존, 123행 부근), 각 항목이 이제 `rentreSubsidy: number | null` 필드를 가짐 (Task 1/2에서 API가 채워 보냄). 기존 `formatKRW(n: number): string` 헬퍼(34행).

### Step 1: 패널에 헤더 행과 렌트리 지원금 열 추가

`app/components/tps/MarginAnalysisClient.tsx:630-645`, 현재:

```tsx
      {subsidyMissing.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 px-5 py-3">
          <div className="text-xs font-medium text-amber-700 mb-2">지원금 미입력 항목 (자동 보정 불가 — 원본 시트 확인 필요)</div>
          <table className="w-full text-xs">
            <tbody>
              {subsidyMissing.map((entry, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-1.5 pr-3">{String(entry.category ?? '')}</td>
                  <td className="py-1.5 pr-3">{String(entry.partner_name ?? '')}</td>
                  <td className="py-1.5 pr-3">{String(entry.model_name ?? entry.model_number ?? '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
```

다음으로 교체:

```tsx
      {subsidyMissing.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 px-5 py-3">
          <div className="text-xs font-medium text-amber-700 mb-2">지원금 미입력 항목 (자동 보정 불가 — 원본 시트 확인 필요)</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400">
                <td className="py-1.5 pr-3">카테고리</td>
                <td className="py-1.5 pr-3">파트너사</td>
                <td className="py-1.5 pr-3">모델명</td>
                <td className="py-1.5 pr-3">렌트리 지원금</td>
              </tr>
            </thead>
            <tbody>
              {subsidyMissing.map((entry, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-1.5 pr-3">{String(entry.category ?? '')}</td>
                  <td className="py-1.5 pr-3">{String(entry.partner_name ?? '')}</td>
                  <td className="py-1.5 pr-3">{String(entry.model_name ?? entry.model_number ?? '')}</td>
                  <td className="py-1.5 pr-3">
                    {entry.rentreSubsidy != null
                      ? formatKRW(Number(entry.rentreSubsidy))
                      : <span className="text-gray-400">렌트리 매칭 안 됨</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
```

- [ ] 위와 같이 수정

### Step 2: 타입 체크

Run: `npm run build`
Expected: 빌드 성공.

- [ ] 실행 후 성공 확인

### Step 3: 린트

Run: `npm run lint`
Expected: 에러 없음.

- [ ] 실행 후 성공 확인

### Step 4: 커밋

```bash
git add app/components/tps/MarginAnalysisClient.tsx
git commit -m "feat: 지원금 미입력 패널에 렌트리 지원금 열 추가"
```

- [ ] 커밋 완료

---

## Task 4: 수동 통합 확인

**Files:** 없음 (코드 변경 없이 확인만)

**Interfaces:**
- Consumes: Task 1~3에서 완료된 API 응답(`subsidyMissing[].rentreSubsidy`)과 UI 렌더링.

### Step 1: 로컬 서버 실행

Run: `npm run dev`
Expected: `http://localhost:3000` (또는 콘솔에 출력된 포트)에서 정상 기동.

- [ ] 실행 확인

### Step 2: `/margin-analysis` 접속 후 지원금 미입력 행이 포함된 조사 파일 업로드

1. 브라우저에서 `/margin-analysis` 접속, "인터넷(TPS)" 탭 활성화.
2. "템플릿 다운로드"로 받은 엑셀에 인터넷/유심/가전 시트 각각 1개 이상의 행을 넣되, 지원금 관련 열(`총 지원금\n (최종)`, `경쟁사 총지원금` 등)을 비워 지원금 미입력 케이스를 만든다. 이 중 최소 1건은 렌트리 상품 DB에 존재하는 통신사+상품명/모델명+계약기간으로, 나머지 1건은 존재하지 않는 값으로 넣는다.
3. "업로드 및 비교" 클릭.

Expected:
- "지원금 미입력 항목" 패널에 4개 열(카테고리/파트너사/모델명/렌트리 지원금)이 헤더와 함께 표시됨.
- 렌트리 DB에 존재하는 상품 행은 "렌트리 지원금" 열에 원화 금액이 표시됨 (예: `123,456원`).
- 존재하지 않는 상품 행은 "렌트리 매칭 안 됨"으로 회색 표시됨.

- [ ] 위 내용 육안 확인

### Step 3: 회귀 확인 — 정상 지원금 입력 행

같은 파일에 지원금이 정상 입력된 행도 함께 넣어 업로드하고, "매칭 N건" 카운트와 기존 렌트리/경쟁사 지원금 비교 카드가 이전과 동일하게 동작하는지 확인한다.

Expected: 매칭/미매칭/교차검증 결과가 이번 변경 전과 동일하게 나타남 (지원금 미입력 이외 경로는 손대지 않았으므로 회귀 없어야 함).

- [ ] 위 내용 육안 확인

---

## Self-Review

**Spec coverage:**
- 데이터 소스 결정(margin-analysis 기존 소스 재사용, survey-selection 기각) → Global Constraints + Task 1/2에서 반영.
- 매칭 순서 변경(인터넷/유심/가전 3개 루프) → Task 1, Task 2.
- `rentreSubsidy` 필드 단순화(matched 별도 노출 없이 null 하나로 통합) → Task 1/2 모두 `matched && record?.product_id` 조건으로 계산해 `rentreSubsidy: number | null` 하나만 push.
- UI 패널 변경(헤더 추가, 렌트리 지원금 열, "렌트리 매칭 안 됨" 문구) → Task 3.
- DB 미저장 유지 → Task 1/2 어디에도 `competitor_subsidies` insert 관련 코드를 건드리지 않음(그대로 둠).
- 테스트 전략(build/lint + 수동 확인) → 각 태스크 Step 2~3, Task 4.

**Placeholder scan:** "TBD"/"TODO" 없음. 모든 코드 블록이 실제 전체 코드(발췌 아님, 각 루프 전체)로 작성됨.

**Type consistency:** `rentreSubsidy: number | null` 필드명이 Task 1(인터넷/유심), Task 2(가전), Task 3(프런트엔드 `entry.rentreSubsidy`)에서 동일하게 사용됨. `tpsEffectiveSubsidyById`/`applianceSnapshotLookup` 변수명이 Task 1/2 내에서 일관됨.
