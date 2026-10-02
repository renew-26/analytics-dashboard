import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// 집계기는 순수 함수라 브라우저 환경이 필요 없다. jsdom 을 켜지 않는다.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { environment: "node", include: ["lib/__tests__/**/*.test.ts"] },
});
