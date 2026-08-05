import { defineConfig } from 'vite';

// base: './' - itch.io serwuje gry HTML z podkatalogu (html-classic.itch.zone/html/NNN/),
// wiec absolutne sciezki do assetow zwracalyby 404. Relatywne dzialaja tez z file://.
export default defineConfig({
  base: './',
});
