import { build } from "vite";
await build();
// MV3 workers cannot use DOM preload helpers or runtime dynamic imports.
await build({
  configFile: false,
  publicDir: false,
  build: {
    emptyOutDir: false,
    target: "chrome114",
    modulePreload: false,
    rollupOptions: {
      input: "src/background.ts",
      output: {
        format: "es",
        entryFileNames: "background.js",
        inlineDynamicImports: true,
      },
    },
  },
});
