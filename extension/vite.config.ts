import { defineConfig } from "vite";
export default defineConfig({
  build: {
    target: "chrome114",
    rollupOptions: {
      input: { dashboard: "dashboard.html", sidepanel: "sidepanel.html" },
    },
  },
});
