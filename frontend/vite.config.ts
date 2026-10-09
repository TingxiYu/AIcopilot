import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // NOTE: no global `test.environment` here on purpose. The default `node`
  // environment keeps `URL`/`URL`-based file reads working for the lib tests
  // under tests/. A test that needs a DOM opts in with a
  // `// @vitest-environment jsdom` docblock (see tests/theme.test.ts).
  // Setting jsdom globally silently breaks tests/citations.test.ts, which does
  // readFileSync(new URL("./fixtures/...", import.meta.url)) -- jsdom's URL
  // rejects the file: scheme with "The URL must be of scheme file".
  //
  // `setupFiles` is not a substitute for an environment: it runs in whichever
  // environment the file selected, and only patches the browser APIs jsdom
  // lacks (scrollTo / scrollIntoView) so antd's virtualised list wrappers do not
  // throw. See tests/setup.ts.
  test: { setupFiles: ["./tests/setup.ts"] },
  server: { host: "0.0.0.0", port: 1996, strictPort: true },
});
