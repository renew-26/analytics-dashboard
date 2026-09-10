"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

type PendingNavCtx = {
  isPending: boolean;
  navigate: (href: string) => void;
};

const Ctx = createContext<PendingNavCtx | null>(null);

/**
 * BasisFilter/BMFilter(헤더)와 그 아래 패널 영역이 "지금 이동 중"이라는 상태
 * 하나를 공유하기 위한 컨텍스트. 필터를 누르면 이 하나의 isPending이 true가
 * 되고, 헤더는 클릭한 탭을 즉시 활성으로 보여주는 동안 본문(PendingRegion)은
 * 옅어진다 — 두 화면이 이 Provider로 한 번만 감싸면 된다.
 *
 * useTransition + router.push를 쓴다(Next 16에서도 안정적). 이동 중에 같은
 * 필터를 다시 눌러도 isPending이 true인 동안은 navigate가 아무 것도 하지
 * 않는다 — 느린 요청이 쌓이지 않는다.
 */
export function PendingNavProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const navigate = useCallback(
    (href: string) => {
      if (isPending) return;
      startTransition(() => {
        router.push(href);
      });
    },
    [isPending, router],
  );

  return <Ctx.Provider value={{ isPending, navigate }}>{children}</Ctx.Provider>;
}

export function usePendingNav(): PendingNavCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("usePendingNav must be used within PendingNavProvider");
  }
  return ctx;
}

/**
 * 낙관적으로 활성 탭을 보여주기 위한 훅. 클릭 즉시 value를 활성으로 표시하고,
 * 전환이 끝나면(isPending이 다시 false가 되면) 서버가 돌려준 current를 다시
 * 신뢰한다 — current를 그대로 계속 쓰면 새 페이로드가 도착하기 전까지 몇 초간
 * 이전 탭이 활성으로 남아 클릭이 안 먹은 것처럼 보인다.
 */
export function useOptimisticActive<T>(current: T): {
  active: T;
  setOptimistic: (value: T) => void;
} {
  const { isPending } = usePendingNav();
  const [optimistic, setOptimistic] = useState<T | null>(null);
  // effect가 아니라 렌더 중에 조정한다("이전 렌더의 정보 저장하기" 패턴) —
  // 전환이 막 끝난 렌더에서 바로 낙관값을 내려야 다음 프레임에 한 번 더
  // 깜빡이는 걸 막는다.
  const [prevPending, setPrevPending] = useState(isPending);
  if (prevPending !== isPending) {
    setPrevPending(isPending);
    if (prevPending && !isPending) setOptimistic(null);
  }

  return { active: optimistic ?? current, setOptimistic };
}

/** 본문 패널 영역 — 이동 중엔 옅어지고 클릭을 받지 않는다. 스켈레톤 전체를
 * 새로 그리지 않고, 이미 보이는 화면 위에 가벼운 진행 표시만 얹는다. */
export function PendingRegion({ children }: { children: ReactNode }) {
  const { isPending } = usePendingNav();
  return (
    <div aria-busy={isPending} className="relative">
      {isPending && (
        <div
          className="skeleton h-[2px] w-full rounded-full mb-3"
          aria-hidden="true"
        />
      )}
      <span className="sr-only" aria-live="polite">
        {isPending ? "필터를 반영하는 중" : ""}
      </span>
      <div
        className={`transition-opacity duration-[var(--dur-enter)] ${
          isPending ? "opacity-50 pointer-events-none" : "opacity-100"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
