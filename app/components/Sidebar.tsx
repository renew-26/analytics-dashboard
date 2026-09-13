"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { COMPANY_MAP } from "@/lib/company-map";
import { CATEGORY_GROUPS } from "@/lib/biz-category";

// 내비에서만 감추는 렌탈사 — 현재 취급하지 않는다. COMPANY_MAP 에서 지우지는
// 않는다: 과거 계약 행이 남아 있어 라벨↔dbName 매핑과 BM 분류가 계속 필요하고,
// 항목을 빼면 그 행들이 미매핑으로 떨어져 집계에서 조용히 새는 버킷이 생긴다.
// /company/루헨스 같은 주소는 그대로 살아 있다 — 내비에 세우지 않을 뿐이다.
const NAV_HIDDEN_COMPANIES = new Set(["루헨스", "현대큐밍", "위더스"]);

// COMPANY_MAP에서 그룹 내 중복 라벨 제거 후 그룹별로 묶기
// (seen은 그룹별로 분리 — LG 헬스케어처럼 여러 그룹에 속하는 라벨이 누락되지 않도록)
const NAV_SECTIONS = ["가전&상조", "정수기", "통신"].map((group) => {
  const seen = new Set<string>();
  return {
    group,
    items: COMPANY_MAP.filter((c) => {
      if (
        c.group !== group ||
        NAV_HIDDEN_COMPANIES.has(c.label) ||
        seen.has(c.label)
      )
        return false;
      seen.add(c.label);
      return true;
    })
      .map((c) => ({ label: c.label, href: `/company/${c.label}` }))
      .sort((a, b) => a.label.localeCompare(b.label, "ko")),
  };
});

const MARKET_ITEMS = [
  { href: "/margin-analysis", label: "타사 비교" },
  { href: "/products", label: "상품 관리" },
  { href: "/survey-selection/appliance", label: "조사 상품 선정 - 가전" },
  { href: "/survey-selection/tps", label: "조사 상품 선정 - TPS" },
];

export default function Sidebar() {
  const rawPathname = usePathname();
  const pathname = decodeURIComponent(rawPathname);

  const activeGroupIndex = NAV_SECTIONS.findIndex(
    (s) =>
      pathname === `/group/${s.group}` ||
      s.items.some((item) => item.href === pathname),
  );

  // 기본으로 열리는 그룹은 활성 그룹이고, 사용자가 직접 접거나 펼친 경우에만 그걸 덮는다.
  // override에 "그때의 활성 그룹"(at)을 함께 담아두면 페이지를 옮겨 activeGroupIndex가
  // 바뀐 순간 override가 스스로 무효가 된다 — 수동으로 펼친 그룹이 이동과 함께 접힌다.
  // effect로 state를 되맞추던 걸 파생값으로 바꾼 것이라 이동마다 나던 추가 렌더가 사라진다.
  const [override, setOverride] = useState<{
    at: number;
    index: number | null;
  } | null>(null);

  const openIndex =
    override && override.at === activeGroupIndex
      ? override.index
      : activeGroupIndex !== -1
        ? activeGroupIndex
        : null;

  // 시장 정보도 같은 규칙을 쓴다 — 하위가 활성이면 열린 채로 시작하고,
  // at(그때의 활성 여부)이 달라지는 순간 사용자의 여닫음은 스스로 무효가 된다.
  const marketActive = MARKET_ITEMS.some((i) => i.href === pathname);
  const [marketOverride, setMarketOverride] = useState<{
    at: boolean;
    open: boolean;
  } | null>(null);
  const marketOpen =
    marketOverride && marketOverride.at === marketActive
      ? marketOverride.open
      : marketActive;

  // 활성일 땐 접지 않는다 — 현재 위치를 내비에서 잃게 된다(그룹과 같은 규칙).
  const toggleMarket = () => {
    if (marketActive) return;
    setMarketOverride({ at: marketActive, open: !marketOpen });
  };

  const toggle = (index: number) => {
    // 활성 그룹은 접지 않는다 — 현재 위치를 내비에서 잃게 된다.
    const next =
      openIndex === index && activeGroupIndex !== index ? null : index;
    setOverride({ at: activeGroupIndex, index: next });
  };

  return (
    <aside className="w-56 h-full bg-white border-r border-[var(--color-gray-200)] flex flex-col flex-shrink-0">
      {/* 로고 / 홈 버튼 */}
      <div className="px-5 py-4">
        <Link href="/" className="group flex items-baseline gap-1">
          <span className="text-lg font-bold text-[var(--color-gray-900)] transition-colors duration-[var(--dur-hover)] ease-[var(--ease-out)] group-hover:text-[var(--color-gray-600)]">
            렌트리
          </span>
          <span className="text-xs text-[var(--color-gray-400)]">애널리틱스</span>
        </Link>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
        {/* ── 새 IA: 홈 → 카테고리 → 렌탈사 (분석이 내려가는 순서) ── */}
        <NavItem href="/" label="홈" active={pathname === "/"} variant="top" />

        {/* 카테고리 — 목록의 부모가 곧 "전체"다. 섹션 라벨과 "전체 카테고리"를
            함께 세우면 같은 말이 두 줄로 겹친다. 부모 항목이 /categories 로 가고
            그 아래 6그룹이 들여쓰기로 매달린다.
            3축은 내비 계층이 아니라 그룹 페이지 안에서 드러난다 —
            내비에 3축을 세우면 클릭 한 번이 더 들고, 그룹이 축에 가려진다. */}
        <NavItem
          href="/categories"
          label="카테고리"
          active={pathname === "/categories"}
          variant="top"
        />
        <div className="ml-[19px] border-l border-[var(--color-gray-200)] pl-[5px]">
          {CATEGORY_GROUPS.map((g) => (
            <NavItem
              key={g.key}
              href={`/categories/${encodeURIComponent(g.key)}`}
              label={g.key}
              // 카테고리 × 렌탈사 × 상품 상세까지 이 그룹의 하위로 본다
              active={
                pathname === `/categories/${g.key}` ||
                pathname.startsWith(`/categories/${g.key}/`)
              }
              variant="sub"
            />
          ))}
        </div>

        <NavItem
          href="/companies"
          label="렌탈사"
          active={pathname === "/companies"}
          variant="top"
        />
        {/* 렌탈사 축 — /companies(전체)와 /group/*(그룹)은 둘 다 "렌탈사 중심 분석"이라
            카테고리와 같은 모양으로 부모 밑에 매단다. 홈=이번 달 현황, 카테고리=카테고리
            중심, 렌탈사=렌탈사 중심 — 1차 내비 세 축이 각자 한 주제를 통째로 진다.
            그룹 라벨 자체가 그룹 요약 링크이고 오른쪽 ▾ 만 소속 렌탈사를 여닫는다 —
            라벨을 토글로 만들면 목적지(/group/…)가 내비에서 사라진다. */}
        <div className="ml-[19px] border-l border-[var(--color-gray-200)] pl-[5px]">
          {NAV_SECTIONS.map((section, index) => {
            const groupHref = `/group/${section.group}`;
            const groupActive = pathname === groupHref;
            const isOpen = openIndex === index;

            return (
              <div key={section.group}>
                {/* 행 전체가 하나의 면이다 — 라벨과 ▾ 가 같은 pill 안에 든다.
                    링크와 토글은 여전히 별개 요소로 남는다(라벨을 토글로 만들면
                    목적지 /group/… 가 내비에서 사라진다). 배경·호버·press 만
                    래퍼로 올려, 어느 쪽을 눌러도 같은 pill 이 눌린다. */}
                <div
                  className={`press mb-1 flex items-center rounded-lg transition ${
                    groupActive ? "" : "hover:bg-[var(--color-gray-100)]"
                  }`}
                  style={
                    groupActive
                      ? { backgroundColor: "var(--color-primary-50)" }
                      : {}
                  }
                >
                  <Link
                    href={groupHref}
                    className={`min-w-0 flex-1 truncate py-[6px] pr-1 pl-3 text-xs transition ${
                      groupActive
                        ? "font-semibold text-[var(--color-primary)]"
                        : "font-medium text-[var(--color-gray-900)]"
                    }`}
                  >
                    {section.group}
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggle(index)}
                    aria-expanded={isOpen}
                    aria-label={`${section.group} 렌탈사 목록`}
                    className={`shrink-0 py-[6px] pr-[11px] pl-1 text-[10px] transition ${
                      groupActive
                        ? "text-[var(--color-primary)]"
                        : "text-[var(--color-gray-400)] hover:text-[var(--color-gray-600)]"
                    }`}
                  >
                    <span
                      className={`block transition-transform duration-150 ease-[var(--ease-out)] motion-reduce:transition-none ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    >
                      ▾
                    </span>
                  </button>
                </div>

                {/* 0fr→1fr 그리드 전환. 조건부 렌더(`isOpen &&`)로 두면 순간 등장·소멸이라
                    같은 앱의 브랜드분석 아코디언과 느낌이 갈린다.
                    닫힌 동안 링크가 탭 순회에 남지 않도록 inert 를 건다. */}
                <div
                  className="grid transition-[grid-template-rows,opacity] duration-200 ease-[var(--ease-out)] motion-reduce:transition-none"
                  style={{
                    gridTemplateRows: isOpen ? "1fr" : "0fr",
                    opacity: isOpen ? 1 : 0,
                  }}
                  inert={!isOpen}
                >
                  <div className="min-h-0 overflow-hidden">
                    {/* 3단째는 크기를 또 줄이지 않는다 — 계층은 들여쓰기 레일이 낸다 */}
                    <div className="ml-[11px] border-l border-[var(--color-gray-200)] pl-[5px]">
                      {section.items.map((item) => (
                        <NavItem
                          key={item.href}
                          href={item.href}
                          label={item.label}
                          active={pathname === item.href}
                          variant="sub"
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <NavItem
          href="/exception-approval"
          label="예외승인 분석"
          active={pathname === "/exception-approval"}
          variant="top"
        />

        {/* 시장 정보 — 렌탈사 그룹과 같은 접이식 행. 다만 이 라벨에는 목적지가
            없어서(그룹은 /group/… 이 있다) 행 전체가 토글 버튼이다.
            접이 애니메이션·레일·▾ 위치는 위 그룹과 같은 것을 쓴다. */}
        <button
          type="button"
          onClick={toggleMarket}
          aria-expanded={marketOpen}
          className="press mb-1 flex w-full items-center rounded-lg transition hover:bg-[var(--color-gray-100)]"
        >
          <span className="min-w-0 flex-1 truncate py-2 pr-1 pl-3 text-left text-sm font-semibold text-[var(--color-gray-900)]">
            시장 정보
          </span>
          <span className="shrink-0 py-2 pr-[11px] pl-1 text-[10px] text-[var(--color-gray-400)]">
            <span
              className={`block transition-transform duration-150 ease-[var(--ease-out)] motion-reduce:transition-none ${
                marketOpen ? "rotate-180" : ""
              }`}
            >
              ▾
            </span>
          </span>
        </button>

        <div
          className="grid transition-[grid-template-rows,opacity] duration-200 ease-[var(--ease-out)] motion-reduce:transition-none"
          style={{
            gridTemplateRows: marketOpen ? "1fr" : "0fr",
            opacity: marketOpen ? 1 : 0,
          }}
          inert={!marketOpen}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="ml-[19px] border-l border-[var(--color-gray-200)] pl-[5px]">
              {MARKET_ITEMS.map((item) => (
                <NavItem
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  active={pathname === item.href}
                  variant="sub"
                />
              ))}
            </div>
          </div>
        </div>
      </nav>
    </aside>
  );
}

function NavItem({
  href,
  label,
  active,
  variant,
}: {
  href: string;
  label: string;
  active: boolean;
  /** top = 1차 내비(홈·카테고리·렌탈사), sub = 그 아래 매달린 항목.
      크기 두 단계(14/20 600 · 12/16 500)로만 계층을 낸다 — 항목 사이를
      띄워서 계층을 만들면 목록이 흩어지고, 붙여 놓으면 부모가 안 보인다. */
  variant?: "top" | "sub";
}) {
  const size = variant === "sub" ? "py-[6px] text-xs" : "py-2 text-sm";
  const rest =
    variant === "top"
      ? "font-semibold text-[var(--color-gray-900)] hover:bg-[var(--color-gray-100)]"
      : "text-[var(--color-gray-600)] hover:bg-[var(--color-gray-100)]";
  return (
    <Link
      href={href}
      className={`press w-full text-left px-3 rounded-lg mb-1 flex items-center gap-2 transition ${size} ${
        active ? "font-semibold" : rest
      }`}
      style={
        active
          ? {
              backgroundColor: "var(--color-primary-50)",
              color: "var(--color-primary)",
            }
          : {}
      }
    >
      {label}
    </Link>
  );
}
