import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import axe from "axe-core";
import { isAllowedThirdPartyOrigin } from "./audit-origin-policy.mjs";

const WEB_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "127.0.0.1";
const PORT = 4187;
const ORIGIN = `http://${HOST}:${PORT}`;
const OUTPUT_PATH = process.argv[2];
const ALLOWED_STORAGE_KEYS = new Set([
  "grumphya-theme",
  "grumphya.privacy-notice.acknowledged.v1",
  "grumphya-auth-session-change",
]);
const ACCESSIBILITY_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const THEME_SWITCH_NAME = /activar modo (claro|oscuro)/iu;
const PRIVACY_NOTICE_NAME = "Ni galletitas ni galletitos";
const NOTICE_ACKNOWLEDGEMENT_LABEL = "Entendido";
const AI_DISCLOSURE_HEADING = "Uso de inteligencia artificial";
const WAIT_INTERVAL_MS = 250;
const SERVER_ATTEMPTS = 80;
const MIN_EVENT_TIMING_RESOLUTION_MS = 16;

function startPreviewServer() {
  return spawn(
    "pnpm",
    ["preview", "--host", HOST, "--port", String(PORT), "--strictPort"],
    {
      cwd: WEB_DIRECTORY,
      env: { ...process.env, API_PROXY_TARGET: "http://127.0.0.1:1" },
      stdio: "ignore",
    },
  );
}

async function waitForPreview(server) {
  for (let attempt = 0; attempt < SERVER_ATTEMPTS; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(
        "El servidor de previsualización terminó antes de iniciar.",
      );
    }
    try {
      const response = await fetch(ORIGIN);
      if (response.ok) return;
    } catch {
      // El servidor todavía no acepta conexiones.
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
  }
  throw new Error("El servidor de previsualización no respondió a tiempo.");
}

async function scanCriticalAccessibilityViolations(page) {
  await page.addScriptTag({ content: axe.source });
  return page.evaluate(async (tags) => {
    const browserAxe = window.axe;
    if (!browserAxe) throw new Error("El escáner de accesibilidad no cargó.");
    const results = await browserAxe.run(document, {
      runOnly: { type: "tag", values: tags },
    });
    return results.violations.filter(
      (violation) => violation.impact === "critical",
    ).length;
  }, ACCESSIBILITY_TAGS);
}

async function collectEvidence() {
  assert.ok(OUTPUT_PATH, "Falta la ruta de salida de la evidencia.");
  const server = startPreviewServer();
  let browser;
  try {
    await waitForPreview(server);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const thirdPartyRequestOrigins = new Set();
    page.on("request", (request) => {
      try {
        const requestUrl = new URL(request.url());
        if (
          requestUrl.protocol === "http:" ||
          requestUrl.protocol === "https:"
        ) {
          if (requestUrl.origin !== ORIGIN) {
            thirdPartyRequestOrigins.add(requestUrl.origin);
          }
        }
      } catch {
        // Non-network browser resources do not count as third-party requests.
      }
    });
    await page.addInitScript(() => {
      const eventDurations = [];
      Object.defineProperty(window, "__grumphyaAuditEventDurations", {
        configurable: false,
        value: eventDurations,
      });
      if (PerformanceObserver.supportedEntryTypes.includes("event")) {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name === "click" || entry.name === "pointerdown") {
              eventDurations.push(entry.duration);
            }
          }
        });
        observer.observe({
          type: "event",
          buffered: true,
          durationThreshold: 16,
        });
      }
    });

    const homeResponse = await page.goto(ORIGIN, { waitUntil: "networkidle" });
    assert.equal(
      homeResponse?.status(),
      200,
      "La página principal no respondió 200.",
    );
    const homeMeasurements = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0];
      const firstContentfulPaint = performance
        .getEntriesByType("paint")
        .find((entry) => entry.name === "first-contentful-paint");
      return {
        responseTimeMs: navigation?.responseStart,
        firstContentfulPaintMs: firstContentfulPaint?.startTime,
      };
    });
    assert.ok(
      typeof homeMeasurements.responseTimeMs === "number" &&
        Number.isFinite(homeMeasurements.responseTimeMs),
      "No se midió el tiempo de respuesta HTML.",
    );
    assert.ok(
      typeof homeMeasurements.firstContentfulPaintMs === "number" &&
        Number.isFinite(homeMeasurements.firstContentfulPaintMs),
      "No se midió First Contentful Paint.",
    );

    const criticalViolationCounts = [
      await scanCriticalAccessibilityViolations(page),
    ];
    const storageBeforeChoice = await page.evaluate(() => ({
      localStorageKeys: Object.keys(localStorage),
      sessionStorageKeys: Object.keys(sessionStorage),
    }));
    const cookiesBeforeChoice = await context.cookies();
    await page.getByRole("dialog", { name: PRIVACY_NOTICE_NAME }).waitFor();
    const noticeButton = page.getByRole("button", {
      name: NOTICE_ACKNOWLEDGEMENT_LABEL,
    });
    await noticeButton.click();
    const noticeAcknowledged = await page.evaluate(
      (key) => localStorage.getItem(key) === "true",
      "grumphya.privacy-notice.acknowledged.v1",
    );

    await page.getByRole("switch", { name: THEME_SWITCH_NAME }).click();
    await page.waitForTimeout(MIN_EVENT_TIMING_RESOLUTION_MS * 2);
    const interactionDuration = await page.evaluate(() => {
      const durations = window.__grumphyaAuditEventDurations;
      if (!Array.isArray(durations)) return undefined;
      return durations.length === 0 ? 16 : Math.max(...durations);
    });
    assert.ok(
      typeof interactionDuration === "number" &&
        Number.isFinite(interactionDuration),
      "No se pudo medir la interacción de cambio de tema.",
    );

    await page.route(`${ORIGIN}/api/registration-intents/current`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ plan: "ILUMINADO" }),
      }),
    );
    await page.goto(`${ORIGIN}/crear-cuenta`, { waitUntil: "networkidle" });
    criticalViolationCounts.push(
      await scanCriticalAccessibilityViolations(page),
    );
    const policyCheckbox = page.locator(
      'input[name="privacyPolicyAcknowledged"]',
    );
    await policyCheckbox.check();
    const privacyChoiceSelected = await policyCheckbox.isChecked();

    await page.goto(`${ORIGIN}/politica-de-privacidad`, {
      waitUntil: "networkidle",
    });
    criticalViolationCounts.push(
      await scanCriticalAccessibilityViolations(page),
    );
    const privacyPolicyVisible = await page
      .getByRole("heading", {
        name: "Política de privacidad",
        level: 2,
        exact: true,
      })
      .isVisible();
    const aiDisclosureVisible = await page
      .getByRole("heading", {
        name: new RegExp(AI_DISCLOSURE_HEADING, "iu"),
        level: 3,
      })
      .isVisible();

    const storageKeys = [
      ...storageBeforeChoice.localStorageKeys,
      ...storageBeforeChoice.sessionStorageKeys,
    ];
    const essentialStorageOnly = storageKeys.every((key) =>
      ALLOWED_STORAGE_KEYS.has(key),
    );
    const firstPartyCookiesOnly = cookiesBeforeChoice.every(
      (cookie) => cookie.domain.replace(/^\./u, "") === HOST,
    );
    const thirdPartyOriginsAllowlisted = [...thirdPartyRequestOrigins].every(
      isAllowedThirdPartyOrigin,
    );

    const result = {
      responseTimeMs: Math.round(homeMeasurements.responseTimeMs),
      firstContentfulPaintMs: Math.round(
        homeMeasurements.firstContentfulPaintMs,
      ),
      interactionToNextPaintMs: Math.ceil(interactionDuration),
      criticalAccessibilityViolations: criticalViolationCounts.reduce(
        (total, count) => total + count,
        0,
      ),
      firstPartyCookiesOnly,
      essentialStorageOnly,
      thirdPartyOriginCount: thirdPartyRequestOrigins.size,
      thirdPartyOriginsAllowlisted,
      privacyChoiceSelected,
      privacyPolicyVisible,
      aiDisclosureVisible,
      noticeAcknowledged,
    };
    await writeFile(OUTPUT_PATH, `${JSON.stringify(result)}\n`, {
      mode: 0o600,
    });
    console.log(
      JSON.stringify({
        event: "AUDIT_BROWSER_EVIDENCE_CAPTURED",
        criticalAccessibilityViolations: result.criticalAccessibilityViolations,
        thirdPartyOriginCount: result.thirdPartyOriginCount,
      }),
    );
  } finally {
    await browser?.close();
    server.kill("SIGTERM");
  }
}

await collectEvidence();
