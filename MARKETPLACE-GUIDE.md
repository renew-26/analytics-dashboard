# AX 마켓플레이스 등록 가이드 (서비스 작성자용)

내 Next.js 서비스를 AX 챌린지 마켓플레이스에 올리기 전에 **레포를 어떻게 고쳐야 하는지**만 다룬다.
마켓플레이스 아키텍처·관리자 운영은 원본 규격 문서를 참고.

> **핵심 전제 (2026-04 규격 변경)**
> 마켓플레이스는 **서비스 소스를 절대 수정하지 않는다.** `next.config.ts`, `package.json`, `.npmrc`, lockfile 모두 그대로 두고
> `git clone → install → build → start`만 실행한다. 예전엔 빌드 스크립트가 설정을 강제 주입했지만 제거됐다.
> **마켓플레이스가 주는 건 환경변수뿐이고, 그걸 읽어 쓰는 건 서비스 몫이다.**

---

## 0. 3분 자가 점검

레포 루트에서 아래를 그대로 실행. 하나라도 걸리면 해당 섹션으로 간다.

```bash
# ① 필수 파일
ls rentre.config.json next.config.* || echo "→ 1번 섹션"

# ② basePath / standalone 설정 여부
grep -n "NEXT_PUBLIC_BASE_PATH\|output" next.config.* || echo "→ 2번 섹션"

# ③ 절대경로 fetch (가장 흔한 사고)
grep -rn "fetch(['\"\`]/" app src 2>/dev/null && echo "→ 3번 섹션"

# ④ basePath를 모르는 원시 네비게이션
grep -rn 'window.location.href\|<a href="/\|<img src="/' app src 2>/dev/null && echo "→ 3번 섹션"

# ⑤ 네이티브 모듈 사용 여부
grep -n "better-sqlite3\|mysql2\|sharp\|bcrypt\|pg-native" package.json && echo "→ 4번 섹션"
```

전부 통과하면 마지막으로 실제 빌드가 도는지 확인한다.

```bash
NEXT_PUBLIC_BASE_PATH=/proxy/my-service npm run build   # pnpm이면 pnpm build
```

---

## 1. 필수 파일 2개

### `rentre.config.json` (레포 **루트**)

```json
{
  "name": "내 서비스 이름",
  "slug": "my-service",
  "icon": "🚀",
  "description": "서비스 설명",
  "author": "작성자명",
  "version": "0.1.0",
  "app": {
    "dir": ".",
    "install": "pnpm install --frozen-lockfile",
    "build": "pnpm build",
    "start": "node .next/standalone/server.js"
  }
}
```

| 필드 | 필수 | 주의사항 |
|---|---|---|
| `name` / `icon`(이모지 1개) / `description` | O | 카탈로그 표시용 |
| `slug` | O | URL 경로가 된다. **영소문자 + 하이픈만** |
| `app.dir` | O | Next 앱이 있는 하위 디렉토리. **monorepo가 아니면 `"."`** |
| `app.install` | - | 기본 `pnpm install --frozen-lockfile`. **npm 쓰면 `"npm ci"`로 바꿀 것** |
| `app.build` | - | 기본 `pnpm build`. npm이면 `"npm run build"` |
| `app.start` | - | 기본 자동감지. `app.dir` 기준 상대경로임에 주의 |
| `app.devCommand` | - | 기본 `pnpm dev -p $PORT` |

> `app.dir`을 잘못 적는 게 초반 실패 1순위다. `package.json`이 있는 디렉토리를 적는다.

### `next.config.ts` (또는 `.js`) — `{app.dir}/` 안

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ✅ 필수: 하드코딩 금지, 반드시 환경변수에서 읽는다
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",

  // ✅ 필수: 없으면 standalone 서버가 안 만들어져 프로세스가 바로 죽는다
  output: "standalone",

  // ✅ 네이티브 모듈 쓸 때만
  serverExternalPackages: ["better-sqlite3", "mysql2"],

  // ⬜ 선택: 타입 에러로 배포가 막히는 게 싫다면
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
```

- [ ] `basePath`가 `process.env.NEXT_PUBLIC_BASE_PATH || ""` 형태인가 (`"/proxy/my-service"` 하드코딩 ❌ — 로컬 개발이 깨진다)
- [ ] `output: "standalone"` 이 있는가
- [ ] Next.js 15+ 인가

---

## 2. 마켓플레이스가 주입하는 환경변수

빌드·실행 시 아래 4개가 자동으로 들어온다. **등록 폼에 직접 입력해도 무시된다.**

| 변수 | 값 | 용도 |
|---|---|---|
| `NEXT_PUBLIC_BASE_PATH` | `/proxy/{slug}` | `next.config`의 `basePath`, 클라이언트 fetch 경로 |
| `SERVICE_URL` | `/proxy/{slug}` | 서비스가 자기 공개 URL을 알아야 할 때 |
| `PORT` | 자동할당(3101~) | 리슨 포트. **직접 정할 필요 없다** |
| `HOSTNAME` | `0.0.0.0` | 바인딩 호스트 |

DB 접속정보·API 키 등 나머지는 `/submit` 폼에서 Key=Value로 넣으면 `.env`로 생성된다.
민감정보는 DB에 평문 저장되므로 관리자가 볼 수 있다는 점을 감안할 것.

---

## 3. basePath 호환성 — 실제로 가장 많이 깨지는 곳

`next.config`에 `basePath`를 넣어도 **소스에 하드코딩된 절대경로는 그대로 깨진다.**
프록시 임베드 시 서비스는 `/proxy/{slug}/` 하위에서 도는데, `/api/...`로 요청하면 마켓플레이스 루트로 나가 404가 난다.

### 위반 → 수정 대조

| 상황 | ❌ 위반 | ✅ 수정 |
|---|---|---|
| 페이지 이동 | `<a href="/about">` | `<Link href="/about">` (next/link) |
| 페이지 이동 | `window.location.href = "/page"` | `router.push("/page")` (next/navigation) |
| API 호출 | `fetch("/api/data")` | `fetch(\`${BASE_PATH}/api/data\`)` — 아래 참조 |
| 리다이렉트 | `NextResponse.redirect(new URL("/login", req.url))` | `const url = req.nextUrl.clone(); url.pathname = "/login"` |
| 이미지 | `<img src="/logo.png">` | `<Image src="/logo.png" />` (next/image) |

**원칙:** Next.js가 제공하는 `<Link>`·`useRouter`·`<Image>`·`redirect()`·`req.nextUrl`은 basePath를 **자동으로** 붙여준다.
원시 HTML(`<a>`, `<img>`), `window.location`, `fetch`는 basePath를 **모른다.** 이 셋만 직접 챙기면 된다.

### 클라이언트 fetch 표준 패턴

파일 상단에 상수 하나 두고 전부 여기에 통과시킨다.

```tsx
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

const res = await fetch(`${BASE_PATH}/api/items`);
const res = await fetch(`${BASE_PATH}/api/items`, { method: "POST", body: form });
```

`NEXT_PUBLIC_` 접두사가 붙은 변수라 빌드 시 클라이언트 번들에 인라인된다. 로컬에선 빈 문자열이라 `/api/items` 그대로 동작한다.

> 서버 컴포넌트에서의 DB 직접 쿼리, 외부 API(`https://...`) 호출은 basePath와 무관하니 손댈 필요 없다.
> `usePathname()`은 basePath를 자동으로 벗겨서 돌려주므로 사이드바 활성화 로직 등도 그대로 둔다.

---

## 4. 네이티브 모듈 & Alpine musl

마켓플레이스 이미지는 **Alpine Linux (musl libc)** 기반이다. macOS/glibc에서 만든 lockfile이 그대로 안 먹을 수 있다.

### 대상 모듈

| 모듈 | 설정 필요 |
|---|---|
| `better-sqlite3`, `mysql2`, `sharp`, `bcrypt`, `pg-native` | **O** |
| `pg`(pure JS), `drizzle-orm`, `@supabase/supabase-js`, `xlsx` | 필요 없음 |

### pnpm을 쓴다면

pnpm v10은 의존성 빌드 스크립트를 기본 차단한다. `package.json`에 허용 목록을 명시한다.

```json
{
  "pnpm": {
    "onlyBuiltDependencies": ["better-sqlite3", "sharp", "@next/swc-linux-x64-musl"]
  }
}
```

그리고 `.npmrc`에 지원 아키텍처를 명시해 musl 바이너리가 lockfile에 포함되게 한다.

```
supported-architectures.os[]=linux
supported-architectures.cpu[]=x64
supported-architectures.libc[]=musl
supported-architectures.libc[]=glibc
```

또는 Alpine 컨테이너에서 lockfile을 다시 만든다.

```bash
docker run --rm -v $(pwd):/app -w /app node:20-alpine sh -c "corepack enable && pnpm install"
git add pnpm-lock.yaml && git commit -m "fix: regenerate lockfile for alpine musl"
```

### npm을 쓴다면

`onlyBuiltDependencies`·`.npmrc supported-architectures`는 **pnpm 전용이라 해당 없다.**
`package-lock.json`이 플랫폼별 optional 의존성을 모두 담으므로 대개 그대로 동작한다.
단 `rentre.config.json`의 `app.install`을 `"npm ci"`, `app.build`를 `"npm run build"`로 반드시 바꿔줄 것.

---

## 5. 등록 절차

1. 위 0~4번 점검 완료 후 **커밋 & 푸시** — 마켓플레이스는 GitHub 레포를 clone해 빌드하므로 로컬에만 있는 수정은 반영되지 않는다.
2. `/submit`에서 등록: 서비스 이름 / slug / 아이콘 / 설명 / GitHub Repo URL / 환경변수
3. 관리자가 `/admin`에서 승인 → 포트 할당 → clone → install → build → start 자동 진행
4. `/proxy/{slug}/` 로 접속 확인
5. 이후 코드 변경 시 서비스 상세 또는 관리자 페이지에서 **"최신화"** (`git pull --ff-only` → 재빌드 → 재시작)

> 상태 흐름: `pending → approved → installing → active`
> 빌드 실패 시 자동으로 `pending`으로 되돌아가고 에러 메시지가 저장된다. 고쳐서 푸시한 뒤 다시 승인 요청하면 된다.

---

## 6. 실패 증상별 처방

| 증상 / 에러 | 원인 | 조치 |
|---|---|---|
| `Module not found: Can't resolve '@/lib/...'` | import한 파일이 레포에 없거나 커밋 누락 | 파일 생성 후 **푸시**. `tsconfig.json`의 `paths`가 `app.dir` 기준인지도 확인 |
| `ERR_PNPM_OUTDATED_LOCKFILE` | lockfile이 `package.json`과 불일치 | 로컬에서 `pnpm install` 후 lockfile 커밋 |
| `Cannot find module @next/swc-linux-x64-musl` | Alpine musl 바이너리 누락 | 4번 섹션 `.npmrc` 추가 또는 Alpine에서 lockfile 재생성 |
| `Could not locate the bindings file` | 네이티브 모듈 빌드 스크립트 차단됨 | `pnpm.onlyBuiltDependencies` + `serverExternalPackages` 확인 |
| 접속은 되는데 **404 / 페이지 안 뜸** | `basePath`를 환경변수로 안 읽음 | `next.config`의 `basePath` 확인 |
| 화면은 뜨는데 **버튼 누르면 실패** | 클라이언트 `fetch("/api/...")` 절대경로 | 3번 섹션 `${BASE_PATH}` 패턴 적용 |
| 빌드는 성공하는데 **프로세스가 죽음** | `output: "standalone"` 누락 → `server.js` 없음 | `next.config`에 추가. `app.start` 경로도 확인 |
| 로컬에선 되는데 마켓에서만 깨짐 | 하드코딩된 절대경로 | `NEXT_PUBLIC_BASE_PATH=/proxy/{slug} npm run build` 로 재현 |

---

## 7. 최종 체크리스트

- [ ] `rentre.config.json` 루트에 존재, `app.dir` 정확, 패키지 매니저에 맞는 `install`/`build`
- [ ] `next.config`에 `basePath: process.env.NEXT_PUBLIC_BASE_PATH || ""`
- [ ] `next.config`에 `output: "standalone"`
- [ ] 클라이언트 `fetch`가 전부 `${BASE_PATH}` 경유
- [ ] 원시 `<a href="/">`, `<img src="/">`, `window.location` 없음 (Next 컴포넌트로 교체)
- [ ] 네이티브 모듈 쓰면 `serverExternalPackages` (+ pnpm이면 `onlyBuiltDependencies`, `.npmrc`)
- [ ] 하드코딩된 포트 없음 (`PORT` 환경변수 사용)
- [ ] `NEXT_PUBLIC_BASE_PATH=/proxy/{slug}` 붙여 로컬 빌드 성공
- [ ] **커밋 & 푸시 완료**
