import { readFile } from "node:fs/promises";
import type { Connect } from "vite";
import React from "react";
import { prerenderToNodeStream } from "react-dom/static";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import prerenderedPublicRoutes from "./src/shared/prerendered-public-routes.json";

const API_PROXY_TARGET =
  process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3000";
const ROOT_ELEMENT = '<div id="root"></div>';
const DEVELOPMENT_SECURITY_PREFIX = "/desarrollo-seguro";
const DEVELOPMENT_SECURITY_FILES = new Map([
  [
    `${DEVELOPMENT_SECURITY_PREFIX}/`,
    {
      file: new URL("../../prototype/index.html", import.meta.url),
      contentType: "text/html; charset=utf-8",
    },
  ],
  [
    `${DEVELOPMENT_SECURITY_PREFIX}/styles.css`,
    {
      file: new URL("../../prototype/styles.css", import.meta.url),
      contentType: "text/css; charset=utf-8",
    },
  ],
]);
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
        const html = (
          await server.transformIndexHtml(request.url ?? route.path, sourceHtml)
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

const developmentSecurityPrototypePlugin: Plugin = {
  name: "grumphya-development-security-prototype",
  configureServer(server) {
    server.middlewares.use(createDevelopmentSecurityMiddleware());
  },
  configurePreviewServer(server) {
    server.middlewares.use(createDevelopmentSecurityMiddleware());
  },
};

function createDevelopmentSecurityMiddleware(): Connect.NextHandleFunction {
  return async (request, response, next) => {
    const pathname = new URL(request.url ?? "/", "http://vite.local").pathname;
    if (
      !pathname.startsWith(`${DEVELOPMENT_SECURITY_PREFIX}/`) &&
      pathname !== DEVELOPMENT_SECURITY_PREFIX
    ) {
      next();
      return;
    }

    if (pathname === DEVELOPMENT_SECURITY_PREFIX) {
      response.statusCode = 308;
      response.setHeader("Location", `${DEVELOPMENT_SECURITY_PREFIX}/`);
      response.end();
      return;
    }

    const staticFile = DEVELOPMENT_SECURITY_FILES.get(pathname);
    if (!staticFile) {
      response.statusCode = 404;
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.end("Not found");
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.statusCode = 405;
      response.setHeader("Allow", "GET, HEAD");
      response.end();
      return;
    }

    try {
      const body = await readFile(staticFile.file);
      response.statusCode = 200;
      response.setHeader("Content-Type", staticFile.contentType);
      response.setHeader("Cache-Control", "no-cache");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      next(error);
    }
  };
}

export default defineConfig({
  plugins: [
    react(),
    developmentSecurityPrototypePlugin,
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
