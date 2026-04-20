const path = require("node:path");

/** @type {import("vitest/config").UserConfig} */
module.exports = {
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    pool: "threads",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**", "coverage/**"],
  },
};
