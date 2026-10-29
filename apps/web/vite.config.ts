import { readFile } from "node:fs/promises";
import React from "react";
import { prerenderToNodeStream } from "react-dom/static";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const API_PROXY_TARGET =
  process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3000";
const PRICING_ROUTE = "/precios";
const PRICING_HTML_FILE = "/precios.html";
const ROOT_ELEMENT = '<div id="root"></div>';
const DEV_PRICING_STYLES = [
  "/src/shared/styles/base.scss",
  "/src/shared/components/mobile-navigation.scss",
  "/src/shared/components/section-page-frame.scss",
  "/src/shared/components/shared-components.scss",
  "/src/features/pricing/pricing.scss",
];

async function renderPricingApp(server: {
  ssrLoadModule: (
    id: string,
  ) => Promise<{ App: React.ComponentType<{ initialPath: string }> }>;
}) {
  const { App } = await server.ssrLoadModule("/src/App.tsx");
  const rendered = await prerenderToNodeStream(
    React.createElement(App, { initialPath: PRICING_ROUTE }),
  );
  let markup = "";
  for await (const chunk of rendered.prelude) markup += chunk;
  return markup;
}

const pricingPrerenderPlugin: Plugin = {
  name: "grumphya-pricing-prerender",
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      if (
        new URL(request.url ?? "/", "http://vite.local").pathname !==
        PRICING_ROUTE
      ) {
        return next();
      }

      try {
        const markup = await renderPricingApp(server);
        const sourceHtml = await readFile(
          `${server.config.root}/index.html`,
          "utf8",
        );
        const stylesheetLinks = DEV_PRICING_STYLES.map(
          (href) => `<link rel="stylesheet" href="${href}?direct" />`,
        ).join("");
        const html = (
          await server.transformIndexHtml(
            request.url ?? PRICING_ROUTE,
            sourceHtml,
          )
        )
          .replace("</head>", `${stylesheetLinks}</head>`)
          .replace(ROOT_ELEMENT, `<div id="root">${markup}</div>`);
        response.statusCode = 200;
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.end(html);
      } catch (error) {
        next(error);
      }
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use((request, _response, next) => {
      const requestUrl = request.url ?? "/";
      const parsedUrl = new URL(requestUrl, "http://vite.local");
      if (parsedUrl.pathname === PRICING_ROUTE) {
        request.url = `${PRICING_HTML_FILE}${parsedUrl.search}`;
      }
      next();
    });
  },
};

export default defineConfig({
  plugins: [react(), pricingPrerenderPlugin],
  build: { cssCodeSplit: true, manifest: true },
  server: {
    headers: {
      "Permissions-Policy":
        "microphone=(self), on-device-speech-recognition=(self)",
    },
    proxy: { "/api": API_PROXY_TARGET },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test-setup.ts",
    include: ["src/**/*.spec.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.spec.{ts,tsx}", "src/test-setup.ts"],
      thresholds: {
        statements: 82,
        branches: 78,
        functions: 80,
        lines: 85,
      },
    },
  },
});
