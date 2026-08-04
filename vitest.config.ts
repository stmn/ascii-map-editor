import { defineConfig } from "vitest/config";

// passWithNoTests: na tym etapie projektu nie ma jeszcze zadnych testow
export default defineConfig({
  test: {
    passWithNoTests: true,
  },
});
