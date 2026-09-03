// ESLint 9 flat config.
// eslint-config-next@16 은 FlatCompat 없이 flat config 배열을 그대로 내보낸다.
import next from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "public/**",
      "migrations/**",
      "queries/**",
    ],
  },
  ...next,
];

export default config;
