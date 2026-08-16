## Overview

렌트리(Rentree) 애널리틱스 디자인 시스템. 내부 분석 도구이므로 **숫자가 주인공이고 UI는 배경**이다. 채도 높은 색을 넓게 쓰지 않고, 색은 의미를 나를 때만 쓴다.

**폰트:** Pretendard Variable (한국어 최적화 Variable 폰트)
**기하:** 버튼 8px, 카드 12px 라운딩
**기준면:** 페이지는 회색(`--color-page`), 카드는 흰색. 카드가 바탕 위에 떠 있는 구조.

정의 위치는 `app/globals.css`이며, 이 문서는 그 토큰의 **용법**을 규정한다. 색을 새로 만들지 말고 여기 있는 것만 쓴다.

## Colors

### Primary — Indigo
브랜드·활성 상태·링크에만 쓴다. 넓은 면적에 칠하지 않는다.

- **Primary** (`--color-primary` — #4338CA): 핵심 CTA, 활성 내비, 강조 인터랙션
- **Primary-700** (`--color-primary-700` — #3730A3): 호버·프레스
- **Primary-500** (`--color-primary-500` — #6366F1): 중간 강조, 아이콘 액센트
- **Primary-400** (`--color-primary-400` — #818CF8): 소프트 강조
- **Primary-200** (`--color-primary-200` — #A5B4FC): 배지 보더
- **Primary-100** (`--color-primary-100` — #C7D2FE): 인터랙티브 배경 tint
- **Primary-50** (`--color-primary-50` — #EEF2FF): 섹션 tint, 활성 내비 배경, 테이블 하이라이트

### 방향색 — 변화량 전용 (한국 증시 컨벤션)
**증감에만 쓴다.** 값 자체의 좋고 나쁨에는 절대 쓰지 않는다.

- **Up** (`--color-up` — #E03131): 증가 / **Up-100** (`--color-up-100` — #FEE2E2)
- **Down** (`--color-down` — #2563EB): 감소 / **Down-100** (`--color-down-100` — #DBEAFE)
- 변화가 미미할 때(±1.5% 이내)는 방향색 대신 `--color-gray-400` + `—` 표기

### 심각도 — 좋고 나쁨 전용
방향색과 **반드시 분리한다.** 대손율처럼 "오르면 나쁜" 지표에 방향색을 쓰면 빨강이 상승과 위험을 동시에 뜻하게 되어 거짓말이 된다.

- **Sev-Warn** (`--color-sev-warn` — #D97706): 주의 임계 / **-100** (#FEF3C7)
- **Sev-Crit** (`--color-sev-crit` — #DC2626): 경고선 초과 / **-100** (#FEE2E2)
- **색 단독으로 의미를 전달하지 않는다.** 항상 텍스트 라벨(`주의`/`이상`/`경고선 5% 초과`)을 함께 붙인다.

### 카테고리 팔레트 — 계열 구분 전용
카테고리·BM처럼 **순서에 의미가 없는 분류**에만 쓴다. 흰 배경 대비 검증을 통과한 5색이며 **순서대로** 사용한다.

- `--color-cat-1` #2A78D6 · `--color-cat-2` #EB6834 · `--color-cat-3` #1BAF7A · `--color-cat-4` #EDA100 · `--color-cat-5` #E87BA4
- 계열이 6개를 넘으면 색을 늘리지 말고 **상위 5개 + "그 외"** 로 묶는다.

### Semantic (보조)
- **Success** (`--color-success` — #1EA85E) / **-100** (#DFF7EA): 달성·완료 상태
- **Warning** (`--color-warning` — #E03131) / **-100** (#FEE2E2): 에러·삭제 확인
- **Accent Purple / Yellow / Orange**: 레거시. 신규 화면에서는 쓰지 않는다.

### Gray Scale
| Token | Hex | Use |
|---|---|---|
| `--color-gray-950` | #161616 | 최고 강조 |
| `--color-gray-900` | #222222 | **프라이머리 텍스트** |
| `--color-gray-700` | #393939 | 세컨더리 타이틀 |
| `--color-gray-600` | #586177 | **세컨더리 텍스트** |
| `--color-gray-500` | #788093 | 서브 텍스트, 플레이스홀더 |
| `--color-gray-400` | #A1A5AC | **뮤트 레이블**, 축 라벨 |
| `--color-gray-250` | #CBD2E3 | 구분선 (강조) |
| `--color-gray-200` | #E2E6EC | **기본 보더** |
| `--color-line-2` | #EEF0F4 | **소프트 구분선** (표 행 사이, 차트 격자) |
| `--color-gray-100` | #F3F5F9 | 섹션 배경, 칩 배경 |
| `--color-gray-25` | #F9FAFB | 가장 밝은 면 |
| `--color-page` | #F6F7F9 | **페이지 바탕** |
| `#FFFFFF` | | 카드·패널 |

## Typography

**Pretendard Variable** (fallback: Pretendard, -apple-system, system-ui, 'Apple SD Gothic Neo', sans-serif)
숫자·경로 표기는 `--font-mono` (ui-monospace, SF Mono, Menlo).

| Role | Size | Weight | Use |
|---|---|---|---|
| 페이지 타이틀 | 17px | 800 | 상단바 h1 |
| 섹션 헤딩 | 15px | 800 | 계층 구분 |
| 패널 타이틀 | 13.5px | 800 | 카드·패널 헤더 |
| 리드 문장 | 19px | 700 | 자동 생성 요약문 |
| KPI 값 | 23px | 800 | 히어로 타일 |
| 카드 대표값 | 27px | 800 | 렌탈사 카드 |
| 본문 | 12.5px | 500 | 설명, 표 셀 |
| 캡션 | 11px | 500 | 보조 설명 |
| 마이크로 라벨 | 10px | 700 | 축 라벨, 태그 |

### Principles
- 타이틀에 네거티브 letter-spacing (-0.2px ~ -1px). 값이 클수록 크게 준다.
- **숫자에는 반드시 `.num`** (`font-variant-numeric: tabular-nums`) — 자릿수가 세로로 맞아야 비교가 된다.
- 한글은 `word-break: keep-all` (body에 전역 적용) — 어절 중간에서 끊지 않는다.
- 단위는 값보다 작고 흐리게 (`<i>건</i>` 12px/gray-500).

## Layout

- **Base unit**: 2px. 실사용 스케일 4 / 6 / 8 / 11 / 13 / 16 / 18 / 22 / 26px
- 사이드바(216px) + 콘텐츠 2-column
- 콘텐츠 패딩 22px 28px, 섹션 간격 26px
- 카드 내부 패딩 14~17px, 패널 헤더 14px 17px 11px

## Elevation

| Token | Value | Use |
|---|---|---|
| `--sh-soft` | `0 2px 8px rgba(0,0,0,.06)` | 드롭다운 |
| 카드 기본 | `0 1px 2px rgba(28,35,56,.04), 0 2px 8px rgba(28,35,56,.05)` | **카드·패널 기본** |
| 카드 호버 | `0 2px 4px rgba(67,56,202,.06), 0 8px 20px rgba(67,56,202,.10)` | 클릭 가능한 카드 |
| `--sh-pop` | `0 8px 24px rgba(30,30,60,.18)` | 툴팁, 토스트 |

그림자는 **깊이 2단계까지만**. 카드 위의 카드는 만들지 않는다.

## Shapes

| Token | Value | Use |
|---|---|---|
| `--r-4` | 4px | 태그, 배지, 차트 막대 |
| `--r-6` | 6px | 소형 버튼 |
| `--r-8` | 8px | **버튼, 인풋, 표 컨테이너** |
| `--r-12` | 12px | **카드, 패널** |
| `--r-full` | 9999px | 상태 pill, 필터 칩 |

## Data Visualization

- **축 하나 원칙**: 자릿수가 다른 계열을 같은 축에 놓지 않는다 (정수기 vs 그 외 카테고리는 차트를 분리).
- 축이 0에서 시작하지 않으면 **밑동을 명시**한다 (`4,200↓` 같은 표기).
- 격자선은 `--color-line-2`, 축 라벨은 `--color-gray-400`. 격자가 데이터보다 진하면 안 된다.
- 값 라벨은 항목이 10개 이하일 때 **직접 라벨**을 우선한다 (범례 왕복 제거).
- 진행 중인 마지막 데이터 점은 **속을 비운 원**으로 표시한다.
- 툴팁은 색 스와치 + 값 + 비교값 순.

## Interaction

- **목적지를 숨기지 않는다**: 클릭 가능한 요소에는 이동 경로를 `--font-mono`로 병기한다 (`/company/코웨이`).
- 필터가 걸린 채로 도착해야 하는 링크는 쿼리 파라미터까지 노출한다 (`?bm=BM3`).
- 호버 트랜지션 0.12s. `prefers-reduced-motion: reduce`에서는 transform 제거.
- 포커스 링: `2px solid var(--color-primary)`, offset 2px.

## Do's and Don'ts

### Do
- 방향색은 **변화량에만**, 심각도색은 **좋고 나쁨에만**
- 심각도색에는 **항상 텍스트 라벨**을 함께
- 모든 숫자에 `.num`
- 판정 기준은 **자기 과거 대비**(최근 3개월 같은 기간 평균)로 — 목표치 입력 없이 성립하게
- 보더는 `--color-gray-200`, 표 행 구분은 `--color-line-2`

### Don't
- `--color-primary`를 넓은 배경에 칠하지 않기
- 순수 블랙(#000) 금지 — `--color-gray-900` 사용
- 대손율·이탈률 등 "오르면 나쁜" 지표에 방향색 쓰지 않기
- 색만으로 상태 전달하지 않기 (색맹 접근성)
- 카테고리 팔레트를 순서·크기 지표에 쓰지 않기
- 인라인 하드코딩 색상 대신 CSS 변수 사용

## Responsive

| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 768px | 사이드바 숨김, 단일 컬럼 |
| Tablet | 768–1079px | 히어로/패널 2단 → 1단 |
| Desktop | ≥ 1080px | 풀 2-column, 히어로 좌우 분할 |

넓은 표는 페이지가 아니라 **표 자체가 가로 스크롤**한다 (`overflow-x: auto`, 첫 열 sticky).
