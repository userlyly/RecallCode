import { defineConfig } from "vite";
export default defineConfig({
  build: {
    target: "chrome114",
    rollupOptions: {
      input: { sidepanel: "sidepanel.html" },
    },
  },
});
