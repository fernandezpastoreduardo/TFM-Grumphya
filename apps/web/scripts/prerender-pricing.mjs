import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { prerenderToNodeStream } from "react-dom/static";

const DIST_DIRECTORY = path.resolve("dist");
const SSR_BUILD_DIRECTORY = path.resolve(".prerender-ssr");
const PRICING_PATH = "/precios";
const PRICING_HTML_PATH = path.join(DIST_DIRECTORY, "precios.html");
const ROOT_ELEMENT = '<div id="root"></div>';
const REQUIRED_PRICING_COPY = [
  "Once usos. Sí, once.",
  "Iluminado",
  "Faltón",
  "UltraChachi",
];

try {
  const { App } = await import(
    pathToFileURL(path.join(SSR_BUILD_DIRECTORY, "App.js")).href
  );
  const render = await prerenderToNodeStream(
    React.createElement(App, { initialPath: PRICING_PATH }),
  );
  let renderedRoot = "";
  for await (const chunk of render.prelude) renderedRoot += chunk;

  for (const copy of REQUIRED_PRICING_COPY) {
    assert.ok(
      renderedRoot.includes(copy),
      `Prerendered pricing page is missing: ${copy}`,
    );
  }

  const manifest = JSON.parse(
    await readFile(path.join(DIST_DIRECTORY, ".vite", "manifest.json"), "utf8"),
  );
  const pageStyles = [
    "src/views/section-page.tsx",
    "src/features/pricing/pricing.tsx",
  ].flatMap((entryKey) => manifest[entryKey]?.css ?? []);
  assert.ok(pageStyles.length > 0, "Pricing styles are missing from the build");
  const stylesheets = [...new Set(pageStyles)]
    .map((href) => `<link rel="stylesheet" href="/${href}" />`)
    .join("");
  const indexHtml = await readFile(
    path.join(DIST_DIRECTORY, "index.html"),
    "utf8",
  );
  assert.ok(
    indexHtml.includes(ROOT_ELEMENT),
    "App root is missing from index.html",
  );

  const pricingHtml = indexHtml
    .replace("</head>", `${stylesheets}</head>`)
    .replace(ROOT_ELEMENT, `<div id="root">${renderedRoot}</div>`);

  await writeFile(PRICING_HTML_PATH, pricingHtml);
} finally {
  await rm(SSR_BUILD_DIRECTORY, { recursive: true, force: true });
  await rm(path.join(DIST_DIRECTORY, ".vite"), {
    recursive: true,
    force: true,
  });
}
