import { readFile } from "node:fs/promises";
import type { Connect } from "vite";
import React from "react";
import { prerenderToNodeStream } from "react-dom/static";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import prerenderedPublicRoutes from "./src/shared/prerendered-public-routes.json";
import { createLighthousePreviewMiddleware } from "./src/shared/lighthouse-preview-middleware";

const API_PROXY_TARGET =
  process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3000";
const ROOT_ELEMENT = '<div id="root"></div>';
const LEGACY_PROTOTYPE_PREFIX = "/desarrollo-seguro";
const EXTERNAL_ACCREDITATION_SITE_URL = "https://desarrolloseguro.org/";
const DEV_SHARED_STYLES = [
  "/src/shared/styles/base.scss",
  "/src/shared/components/mobile-navigation.scss",
  "/src/shared/components/section-page-frame.scss",
  "/src/shared/components/shared-components.scss",
];

async function renderPublicRoute(
  server: {
    ssrLoadModule: (
      id: string,
    ) => Promise<{ App: React.ComponentType<{ initialPath: string }> }>;
  },
  routePath: string,
) {
  const { App } = await server.ssrLoadModule("/src/App.tsx");
  const rendered = await prerenderToNodeStream(
    React.createElement(App, { initialPath: routePath }),
  );
  let markup = "";
  for await (const chunk of rendered.prelude) markup += chunk;
  return markup;
}

const publicRoutePrerenderPlugin: Plugin = {
  name: "grumphya-public-route-prerender",
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const parsedUrl = new URL(request.url ?? "/", "http://vite.local");
      const route = prerenderedPublicRoutes.find(
        ({ path }) => path === parsedUrl.pathname,
      );
      if (!route) return next();

      try {
        const markup = await renderPublicRoute(server, route.path);
        const sourceHtml = await readFile(
          `${server.config.root}/index.html`,
          "utf8",
        );
        const stylesheetLinks = [
          ...DEV_SHARED_STYLES,
          ...route.developmentStyles,
        ]
          .map((href) => `<link rel="stylesheet" href="${href}?direct" />`)
          .join("");
        const imagePreloads = (route.preloadImages ?? [])
          .map(({ href, media }) => {
            if (
              !/^\/assets\/[a-zA-Z0-9/_-]+\.(svg|webp|png)$/.test(href) ||
              (media !== undefined && !/^\(max-width: \d+px\)$/.test(media))
            ) {
              throw new Error(
                `Invalid image preload configuration for ${route.path}`,
              );
            }
            const mediaAttribute = media ? ` media="${media}"` : "";
            return `<link rel="preload" as="image" href="${href}" fetchpriority="high"${mediaAttribute} />`;
          })
          .join("");
        const html = (
          await server.transformIndexHtml(request.url ?? route.path, sourceHtml)
        )
          .replace("</head>", `${imagePreloads}${stylesheetLinks}</head>`)
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
      if (!request.headers.accept?.includes("text/html")) return next();

      const route = prerenderedPublicRoutes.find(
        ({ path }) => path === parsedUrl.pathname,
      );
      if (route?.path === "/") return next();
      if (route) {
        request.url = `${parsedUrl.pathname}.html${parsedUrl.search}`;
      } else {
        request.url = `/app.html${parsedUrl.search}`;
      }
      next();
    });
  },
};

const lighthousePreviewFixturesPlugin: Plugin = {
  name: "grumphya-lighthouse-preview-fixtures",
  configurePreviewServer(server) {
    const middleware = createLighthousePreviewMiddleware(
      process.env.GRUMPHYA_LHCI_FIXTURES === "1",
    );
    if (middleware) server.middlewares.use(middleware);
  },
};

const legacyPrototypeRedirectPlugin: Plugin = {
  name: "grumphya-legacy-prototype-redirect",
  configureServer(server) {
    server.middlewares.use(createLegacyPrototypeRedirect());
  },
  configurePreviewServer(server) {
    server.middlewares.use(createLegacyPrototypeRedirect());
  },
};

function createLegacyPrototypeRedirect(): Connect.NextHandleFunction {
  return (request, response, next) => {
    const pathname = new URL(request.url ?? "/", "http://vite.local").pathname;
    if (
      !pathname.startsWith(`${LEGACY_PROTOTYPE_PREFIX}/`) &&
      pathname !== LEGACY_PROTOTYPE_PREFIX
    ) {
      next();
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.statusCode = 405;
      response.setHeader("Allow", "GET, HEAD");
      response.end();
      return;
    }

    response.statusCode = 308;
    response.setHeader("Location", EXTERNAL_ACCREDITATION_SITE_URL);
    response.end();
  };
}

export default defineConfig({
  plugins: [
    react(),
    legacyPrototypeRedirectPlugin,
    lighthousePreviewFixturesPlugin,
    publicRoutePrerenderPlugin,
  ],
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
    maxWorkers: 2,
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
