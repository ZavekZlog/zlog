import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Unused diagnostic (CJS require in a .mjs filename). Do not broaden to scripts/**.
    "scripts/introspect-live-daily-reports-schema.mjs",
    // Lint-control fixtures only. Do not broaden to scripts/**.
    "scripts/fixtures/**",
  ]),
]);

export default eslintConfig;
