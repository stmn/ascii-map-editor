import { defineConfig } from "vitest/config";

// passWithNoTests: zostaje wlaczone, zeby `npm test` nie wywalal sie
// przy odpalaniu podzbioru testow (filtr nazwy pliku bez trafienia)
export default defineConfig({
  test: {
    passWithNoTests: true,
  },
});
