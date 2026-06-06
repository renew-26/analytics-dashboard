## Overview

렌트리(Rentree) 대시보드 디자인 시스템. Figma 디자인 토큰 기반의 인디고 프라이머리 컬러 체계를 사용한다. 인디고 계열의 강한 프라이머리 색상과 쿨그레이 중성 팔레트를 결합해 신뢰감 있는 B2B 분석 툴의 인상을 만든다.

**폰트:** Pretendard Variable (한국어 최적화 Variable 폰트)  
**기하:** 버튼 8px, 카드 12px 라운딩 — 절제된 비즈니스 UI

## Colors

### Primary — Indigo
- **Primary** (`--primary` — #3531FF): 핵심 CTA, 활성 상태, 강조 인터랙션
- **Primary-700** (`--primary-700` — #2C28DC): 호버·프레스 상태
- **Primary-500** (`--primary-500` — #5D7CF9): 중간 강조, 아이콘 액센트
- **Primary-400** (`--primary-400` — #6E81FF): 소프트 강조
- **Primary-200** (`--primary-200` — #A9B1FF): 배지 배경, 라이트 인디케이터
- **Primary-100** (`--primary-100` — #DBE5FF): 인터랙티브 요소 배경 tint
- **Primary-50** (`--primary-50` — #EDF2FF): 섹션 배경 tint, 테이블 하이라이트

### Semantic
- **Warning** (`--warning` — #F90000): 에러, 삭제 확인 등 고위험 액션
- **Warning-500** (`--warning-500` — #FF5252): 소프트 경고
- **Warning-100** (`--warning-100` — #FFE0E0): 경고 배경 tint
- **Success** (`--success` — #1EA85E): 성공, 긍정 지표, 증가 트렌드
- **Success-100** (`--success-100` — #DFF7EA): 성공 배경 tint

### Accent
- **Accent Purple** (`--accent-purple` — #9747FF): 보조 강조 색상
- **Accent Yellow** (`--accent-yellow` — #FFD600): 주의 배지, 포인트 하이라이트
- **Accent Orange** (`--accent-orange` — #FF7700): 감소 트렌드, 중간 경고

### Gray Scale
- **Gray-950** (`--gray-950` — #161616): 최고 강조 텍스트
- **Gray-900** (`--gray-900` — #222222): 프라이머리 텍스트, 바디
- **Gray-850** (`--gray-850` — #262624): 섹션 타이틀
- **Gray-800** (`--gray-800` — #2C2C2C): 강조 바디
- **Gray-700** (`--gray-700` — #393939): 세컨더리 타이틀
- **Gray-600** (`--gray-600` — #586177): 세컨더리 텍스트
- **Gray-500** (`--gray-500` — #788093): 서브 텍스트, 플레이스홀더
- **Gray-400** (`--gray-400` — #A1A5AC): 뮤트 레이블
- **Gray-350** (`--gray-350` — #A9B1C3): 비활성 아이콘
- **Gray-300** (`--gray-300` — #BABAB7): 구분선 (진한)
- **Gray-250** (`--gray-250` — #CBD2E3): 구분선
- **Gray-200** (`--gray-200` — #E2E6EC): 보더, 1px 구분선
- **Gray-150** (`--gray-150` — #EBEBE9): 소프트 구분선
- **Gray-100** (`--gray-100` — #F3F5F9): 섹션 배경, 테이블 행 배경
- **Gray-50** (`--gray-50` — #F6F6F6): 페이지 배경
- **Gray-25** (`--gray-25` — #F9FAFB): 가장 밝은 배경
- **White** (`--white` — #FFFFFF): 카드, 패널 배경

## Typography

### Font Family
**Pretendard Variable** (primary): 한국어 최적화 가변 폰트. Fallbacks: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, 'Apple SD Gothic Neo', sans-serif.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `.t-title32` | 32px | 700 | 40px | -0.6px | 페이지 타이틀 |
| `.t-title28` | 28px | 700 | 36px | -0.5px | 섹션 오프너 |
| `.t-title24` | 24px | 700 | 32px | -0.4px | 카드 헤딩 |
| `.t-title20` | 20px | 700 | 26px | -0.3px | 서브 헤딩 |
| `.t-title18` | 18px | 700 | 24px | -0.3px | 패널 타이틀 |
| `.t-title16` | 16px | 700 | 22px | -0.2px | 강조 레이블 |
| `.t-title14` | 14px | 700 | 20px | -0.2px | 테이블 헤더 |
| `.t-title12` | 12px | 700 | 16px | -0.1px | 배지 레이블 |
| `.t-body16` | 16px | 500 | 22px | -0.2px | 프라이머리 바디 |
| `.t-body14` | 14px | 500 | 20px | -0.2px | 세컨더리 바디 |
| `.t-body12` | 12px | 500 | 16px | -0.1px | 캡션 바디 |
| `.t-caption12` | 12px | 400 | 16px | 0 | 뮤트 캡션 (gray-500) |
| `.t-caption10` | 10px | 500 | 14px | 0 | 초소형 레이블 (gray-500) |

### Principles
- 모든 타이틀에 네거티브 letter-spacing (-0.1px ~ -0.6px)
- 700 weight for 타이틀, 500 for 바디/버튼, 400 for 뮤트 캡션
- 한국어 가독성을 위한 넉넉한 line-height

## Layout

### Spacing System
- **Base unit**: 2px
- **Tokens**: `--s-2` (2px), `--s-4` (4px), `--s-6` (6px), `--s-8` (8px), `--s-10` (10px), `--s-12` (12px), `--s-16` (16px), `--s-20` (20px), `--s-24` (24px), `--s-28` (28px), `--s-32` (32px), `--s-40` (40px), `--s-48` (48px), `--s-56` (56px), `--s-64` (64px)

### Grid & Container
- 사이드바 + 콘텐츠 2-column 레이아웃
- 콘텐츠 영역 max-width 제한 없음 (full-width 테이블 우선)
- 섹션 내 패딩: 24px (모바일 16px)

## Elevation & Depth

| Level | Value | Use |
|---|---|---|
| `--sh-soft` | `0 2px 8px 0 rgba(0,0,0,0.06)` | 기본 카드, 드롭다운 |
| `--sh-card` | `0 4px 16px 0 rgba(142,142,142,0.30)` | 팝업 카드, 모달 |
| `--sh-pop` | `0 8px 24px 0 rgba(30,30,60,0.18)` | 플로팅 패널, 툴팁 |

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `--r-2` | 2px | 인디케이터 점 |
| `--r-4` | 4px | 태그 칩, 배지 |
| `--r-6` | 6px | 소형 버튼 |
| `--r-8` | 8px | **버튼, 인풋** |
| `--r-12` | 12px | **카드, 패널** |
| `--r-16` | 16px | 대형 카드 |
| `--r-20` | 20px | 바텀시트, 모달 |
| `--r-full` | 9999px | 상태 배지, 필 탭 |

## Do's and Don'ts

### Do
- `--primary` (#3531FF)를 핵심 CTA에만 사용
- 버튼에 `--r-8` (8px), 카드에 `--r-12` (12px) 적용
- 테이블 증가 지표에 `--success`, 감소 지표에 `--accent-orange` 사용
- 텍스트 계층: 타이틀 `--gray-900`, 서브 `--gray-600`, 뮤트 `--gray-500`
- 보더는 `--gray-200` 기본, 강조 보더는 `--gray-300`

### Don't
- `--primary`를 배경 대면적에 사용하지 않기
- 순수 블랙(#000) 텍스트 사용 금지 — `--gray-900` (#222222) 사용
- `--warning` (#F90000)을 일반 UI 강조에 사용하지 않기 (에러·삭제 전용)
- 인라인 하드코딩 색상 대신 CSS 변수 사용

## Responsive Behavior

### Breakpoints
| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 768px | 사이드바 숨김, 단일 컬럼 |
| Tablet | 768 – 1023px | 사이드바 축소, 2-column |
| Desktop | ≥ 1024px | 풀 사이드바 + 콘텐츠 영역 |
