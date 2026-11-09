const { chromium } = require("@playwright/test");

const FORM_FACTOR =
  process.env.GRUMPHYA_LHCI_FORM_FACTOR === "desktop" ? "desktop" : "mobile";
const WEB_PORT = "4173";
const OUTPUT_DIRECTORY =
  process.env.GRUMPHYA_LHCI_OUTPUT_DIR ?? ".lighthouseci";
module.exports = {
  ci: {
    collect: {
      startServerCommand: `GRUMPHYA_LHCI_FIXTURES=1 pnpm preview --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      startServerReadyPattern: "127.0.0.1:4173",
      url: [
        `http://127.0.0.1:${WEB_PORT}/`,
        `http://127.0.0.1:${WEB_PORT}/precios`,
        `http://127.0.0.1:${WEB_PORT}/lo-peor-de-lo-peor`,
      ],
      numberOfRuns: 3,
      chromePath: chromium.executablePath(),
      settings: {
        chromeFlags: ["--no-sandbox"],
        ...(FORM_FACTOR === "desktop" ? { preset: "desktop" } : {}),
        onlyCategories: [
          "performance",
          "accessibility",
          "best-practices",
          "seo",
        ],
      },
    },
    assert: {
      // Informative first baseline: these warn but do not fail CI while variance is observed.
      assertions: {
        "categories:performance": ["warn", { minScore: 0.65 }],
        "categories:accessibility": ["warn", { minScore: 0.9 }],
        "categories:best-practices": ["warn", { minScore: 0.9 }],
        "categories:seo": ["warn", { minScore: 0.8 }],
        "largest-contentful-paint": ["warn", { maxNumericValue: 4500 }],
        "cumulative-layout-shift": ["warn", { maxNumericValue: 0.25 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: OUTPUT_DIRECTORY,
    },
  },
};
