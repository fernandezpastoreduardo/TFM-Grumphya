import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { prerenderToNodeStream } from "react-dom/static";

const DIST_DIRECTORY = path.resolve("dist");
const SSR_BUILD_DIRECTORY = path.resolve(".prerender-ssr");
const ROUTES_CONFIG_PATH = path.resolve(
  "src/shared/prerendered-public-routes.json",
);
const ROOT_ELEMENT = '<div id="root"></div>';

try {
  const routes = JSON.parse(await readFile(ROUTES_CONFIG_PATH, "utf8"));
  const { App } = await import(
    pathToFileURL(path.join(SSR_BUILD_DIRECTORY, "App.js")).href
  );
  const manifest = JSON.parse(
    await readFile(path.join(DIST_DIRECTORY, ".vite", "manifest.json"), "utf8"),
  );
  const indexHtml = await readFile(
    path.join(DIST_DIRECTORY, "index.html"),
    "utf8",
  );
  assert.ok(
    indexHtml.includes(ROOT_ELEMENT),
    "App root is missing from index.html",
  );
  await writeFile(path.join(DIST_DIRECTORY, "app.html"), indexHtml);

  for (const route of routes) {
    const render = await prerenderToNodeStream(
      React.createElement(App, { initialPath: route.path }),
    );
    let renderedRoot = "";
    for await (const chunk of render.prelude) renderedRoot += chunk;

    for (const copy of route.requiredCopy) {
      assert.ok(
        renderedRoot.includes(copy),
        `Prerendered ${route.path} page is missing: ${copy}`,
      );
    }

    const pageStyles = manifest[route.manifestEntry]?.css ?? [];
    if (route.path !== "/") {
      assert.ok(
        pageStyles.length > 0,
        `Styles are missing from the build for ${route.path}`,
      );
    }
    const stylesheets = [...new Set(pageStyles)]
      .map((href) => `<link rel="stylesheet" href="/${href}" />`)
      .join("");
    const html = indexHtml
      .replace("</head>", `${stylesheets}</head>`)
      .replace(ROOT_ELEMENT, `<div id="root">${renderedRoot}</div>`);
    const outputPath =
      route.path === "/"
        ? path.join(DIST_DIRECTORY, "index.html")
        : path.join(DIST_DIRECTORY, `${route.path.slice(1)}.html`);

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, html);
    console.log(`Prerendered ${route.path}`);
  }
} finally {
  await rm(SSR_BUILD_DIRECTORY, { recursive: true, force: true });
  await rm(path.join(DIST_DIRECTORY, ".vite"), {
    recursive: true,
    force: true,
  });
}
