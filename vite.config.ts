import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [svelte()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
  },
  optimizeDeps: {
    include: ["@mmote/niimbluelib"],
  },
  resolve: {
    preserveSymlinks: true,
    alias: {
      $: resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5180,
  },
});
