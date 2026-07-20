import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    // Scoped to this project's own test files: this working directory also
    // contains unrelated sibling projects (e.g. ui-ux-pro-max-skill) whose
    // test files vitest's default glob would otherwise pick up.
    include: ["tests/**/*.{test,spec}.ts"],
  },
});
