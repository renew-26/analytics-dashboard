/**
 * 라우트 전환 중 표시되는 골격.
 *
 * 이 대시보드는 서버 컴포넌트에서 Supabase 를 50,000 건 단위로 페이지네이션하며
 * 읽는다. loading.tsx 가 없으면 링크를 눌러도 이전 화면이 몇 초간 그대로 있다가
 * 통째로 교체돼, 사용자는 클릭이 먹었는지 알 수 없다.
 *
 * 페이지마다 레이아웃이 달라 실제 배치를 흉내내지 않는다 — 실제와 다른 골격은
 * 내용이 도착하는 순간 화면이 튀어서 없느니만 못하다. 폭·높이만 맞춘 중립적인
 * 블록으로 "받는 중"만 전한다.
 */
export default function Loading() {
  return (
    <div
      className="min-h-screen bg-[var(--color-page)] px-10 pt-8 pb-16 space-y-[26px]"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">불러오는 중</span>

      <section className="space-y-[11px]">
        <div className="skeleton h-5 w-48" />
        <div className="skeleton h-[132px] w-full rounded-[12px]" />
      </section>

      <section className="space-y-[11px]">
        <div className="skeleton h-5 w-36" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(272px,1fr))] gap-[13px]">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="skeleton h-[124px] rounded-[12px]"
              // 한꺼번에 깜빡이면 화면 전체가 맥동한다. 짧게 어긋내 시선을 흐른다.
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>
      </section>

      <section className="space-y-[11px]">
        <div className="skeleton h-5 w-40" />
        <div className="skeleton h-[280px] w-full rounded-[12px]" />
      </section>
    </div>
  );
}
