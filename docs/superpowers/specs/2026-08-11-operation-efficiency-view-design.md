# 운영효율뷰 — 설계

- 작성일: 2026-08-11
- 대상: `renew-26/analytics-dashboard` 저장소, `margin-analysis-2` 브랜치 위에서 진행
- 위치: "상품 전략" 섹션(카테고리 트렌드/브랜드 분석 옆)에 신규 메뉴·페이지 추가
- 상태: 스펙 문서 커밋 완료(`margin-analysis-2`). Supabase 프로젝트 불일치·`target_margin` 컬럼 가정은 2026-08-11 재개 세션에서 검증 완료(아래 "미해결 이슈" 참고). 전체 설계 최종 승인·브랜치 생성은 아직 남아있음.

## 배경 / 목적

지원금 산정 체계 고도화 프로젝트(트랙 B) 과정에서 Redash SQL로 "운영효율"(산식대로 계산한 최대지원금보다 실제로 얼마나 덜/더 지급했는지)을 검증했고, TPS(인터넷) 카테고리 중 "안심 TPS" 채널에 4개월간(3~6월) 약 3.5억원의 운영효율 여력이 집중된 것을 확인했다. 이 분석을 1회성 Redash 쿼리가 아니라 analytics-dashboard의 상시 조회 화면으로 만들기 위한 설계다.

## 결정 사항 (사용자 확정)

- **스코프**: TPS만 우선 vs 가전까지 포함 두 안을 제시했고, **가전까지 함께 진행**하는 안으로 확정했다(Redash 4441/4445 쿼리 수정이 선행 조건으로 필요한, 더 큰 작업량의 안을 선택).
- **운영효율 정의**: `운영효율 = sales − bad_debt − target_margin − sales_incentive` (최대지원금 대비 실제지급지원금의 차이). `sales > 0`인 행만 포함 — 정산 미완료 데이터를 제외하기 위한 완결성 필터(과거 특정 구간에서 76.8%가 정산 미완료였던 사례가 있어 필수).
- **대상 채널**: BM2/BM3 채널만 (BM1은 지원금 관리 대상 아님).
- **요약카드 문구**: 내부 용어를 그대로 쓰지 않고 쉬운 말로 순화 확정.
  - "총 운영효율" → **"이번 달에 안 쓰고 남은 여유자금(플러스) 또는 규정보다 더 나간 돈(마이너스)"**
  - "건당 평균" → **"건당 평균 여유자금"**
  - "완결성비율" → 카드가 아니라 각주로 이동, **"정산 완료 데이터 OO% 기준"** 형태로 표기(정산 지연으로 아직 숫자가 안 찍힌 건이 있음을 알리는 용도).

## 데이터 흐름 (4단계, 순서대로 진행)

```
① Redash 4441(주문확정)/4445(계약완료) 쿼리에 "타겟마진" 컬럼 추가
     COALESCE(settle.target_margin, pnl.target_margin) AS "타겟마진"
     ↓
② Supabase raw_orders / raw_contracts 테이블에 target_margin 컬럼 추가 (ALTER TABLE)
     ↓
③ app/api/sync/route.ts 의 RedashOrderRow / RedashContractRow 타입 + 매핑 로직에 target_margin 반영
     ↓
④ 신규 페이지가 raw_orders(가전 주문) + raw_contracts(가전 계약) + tps_pnl(TPS)을 조회해 운영효율 계산
```

- TPS는 `tps_pnl` 테이블(Redash Query 4405가 이미 동기화)에 `sales`/`bad_debt`/`target_margin`과 실제 지원금 필드(`total_subsidy`/`coupon_amount`/`tv_subsidy`/`layer3_subsidy`)가 모두 있어 **신규 동기화 파이프라인 없이 바로 계산 가능**.
- 가전은 `raw_orders`/`raw_contracts`에 `sales`/`sales_incentive`/`bad_debt`는 있지만 `target_margin`이 없어(최종 `contribution_margin`만 존재) 위 4단계가 필요.
- Redash 쿼리 수정 시 가정 하나: `settle_prop_item` 테이블에도 `target_margin` 컬럼이 있다고 가정(다른 필드들이 같은 패턴이라 유추). 없으면 Redash가 "Unknown column" 에러로 즉시 드러나므로 안전.
  - **✅ 검증 완료(2026-08-11)**: Redash Query 4405(TPS_PNL, 이미 운영 중)가 정확히 같은 두 테이블(`s`=`settle_prop_item`, `pnl`=`prop_item_pnl`)에 `COALESCE(s.target_margin, pnl.target_margin) AS 공헌이익_타겟마진`를 이미 쓰고 있고, 실제로 `tps_pnl.target_margin`에 값이 들어오고 있다(Supabase에서 직접 확인). 즉 4441/4445에 같은 패턴을 추가해도 안전하다는 게 가정이 아니라 사실로 확인됨.

## 참고 발견 (설계에 영향)

- `app/exception-approval/` 페이지가 이미 존재하며 같은 `tps_pnl` 데이터로 "상담원 재량 예외승인이 타겟마진/대손비를 얼마나 깎아먹었는지"(산식보다 더 준 위험 방향)를 본다 — 운영효율뷰는 그 반대 방향(산식보다 덜 준 여력)을 보는 페이지라 개념이 겹치지 않지만 같은 데이터·같은 상담사 재량 이슈를 다루므로 참고할 것.

## 새 페이지 구조 (기존 패턴 그대로 따름: `app/{route}/page.tsx` + `{PascalCase}Client.tsx`)

- `app/operation-efficiency/page.tsx` — Server Component, Supabase 직접 조회
- `app/operation-efficiency/OperationEfficiencyClient.tsx` — Client, 카테고리 필터/드릴다운
- `app/components/Sidebar.tsx`의 "상품 전략" `SectionHeader` 아래, 기존 `카테고리 트렌드`/`브랜드 분석` `NavItem` 다음에 `href="/operation-efficiency"` 항목 추가 (라벨/href/active만 필요, 아이콘 없음)

## 화면 구성 (Redash 프로토타입과 동일한 3단)

1. 요약 카드 — 총 운영효율 / 건당 평균 여유자금 / (각주) 정산 완료 데이터 비율
2. 카테고리 × 브랜드 랭킹 (막대그래프, recharts)
3. 상품 드릴다운 테이블

`raw_orders`(주문확정)와 `raw_contracts`(계약완료) 중 기준일을 무엇으로 할지는, 기존 `exception-approval`이 `order_confirmed_at ?? contract_completed_at`을 함께 쓰는 패턴을 따라 두 테이블을 합쳐 보는 방향으로 논의됨(최종 확정은 아님).

## 미해결 이슈 / 다음 세션에서 반드시 확인할 것

- ~~**Supabase 프로젝트 불일치**~~ → **해결(2026-08-11)**: analytics-dashboard가 실제로 쓰는 Supabase 프로젝트는 `hfvbozipidhxosrjwcrh`(별도 계정, MCP에 연결된 `kellyzzang's Project`와 다름)이다. 이 프로젝트에 `tps_pnl`/`raw_orders`/`raw_contracts` 테이블이 모두 존재함을 REST API로 직접 확인했다(`raw_orders`/`raw_contracts`는 `target_margin` 컬럼만 없는 상태로, 설계 가정과 일치). `.env.local`(gitignore 처리됨)에 접속 정보 저장해둠.
- ~~`settle_prop_item.target_margin` 컬럼 존재 가정~~ → **검증 완료**: 위 "데이터 흐름" 섹션 참고.
- 위 결정 사항은 요약카드 3개까지만 사용자가 직접 승인했고, 데이터 흐름 ①~④·페이지 구조·계산 로직·화면 3단 구성 전체에 대한 최종 "네, 이대로 진행" 확답은 세션 종료 시점까지 받지 못했다 — 재개 시 전체 설계를 한 번 더 읽고 승인 여부를 확인할 것.
- ~~Redash 4441/4445 쿼리 수정~~ → **적용 완료(2026-08-11)**: Redash API로 두 쿼리 모두 `COALESCE(settle.target_margin, pnl.target_margin) AS "타겟마진"` 반영, 실제 실행해서 값 확인함(4441 샘플 53,280원 / 4445 샘플 80,000원). 다른 필드는 변경 없음.
- 브랜치(`operation-efficiency` 등 가칭)는 **아직 생성되지 않았다**. 남은 순서: Supabase `ALTER TABLE`(직접 실행 필요, DDL은 REST API로 불가) → `app/api/sync/route.ts` 매핑 반영 → 전체 설계 최종 승인 → 신규 브랜치 생성 → 구현.
