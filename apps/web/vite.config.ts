import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolveCareerNavigatorBasePath } from "./vite-base-path";

export default defineConfig({
  base: resolveCareerNavigatorBasePath(),
  plugins: [react()],
});
