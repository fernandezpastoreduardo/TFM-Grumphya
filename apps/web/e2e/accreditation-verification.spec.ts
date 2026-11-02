import { expect, test } from "@playwright/test";

const VERIFICATION_URL = "/acreditaciones/DS-GRUMPHYA-2026-001";
const ACADEMIC_RECORD = {
  id: "DS-GRUMPHYA-2026-001",
  issuer: "Desarrollo Seguro",
  application: "Grumphya",
  authorizedDomains: ["grumphya.com"],
  status: "demonstration",
  issuedAt: "2026-10-28T09:38:54.000Z",
  validatedAt: "2026-10-28T10:45:48.000Z",
  validationMethod: "Revisión técnica interna de código y pruebas",
  expiresAt: null,
  scope: "Prototipo académico de Grumphya",
  criteria: ["Áreas propuestas para evaluación"],
  assurances: [
    {
      id: "privacy",
      title: "Privacidad orientada al RGPD",
      description: "Controles de datos documentados.",
      evidence: "Código y pruebas internas.",
      limitation: "Revisión jurídica pendiente.",
    },
  ],
  disclaimer:
    "Demostración académica, sin certificación oficial ni auditoría independiente.",
};

test("opens the secure-development prototype from the home footer and links to verification", async ({
  page,
}) => {
  await page.route("**/api/accreditations/**", (route) =>
    route.fulfill({ json: ACADEMIC_RECORD }),
  );
  await page.goto("/");

  const link = page.getByRole("link", {
    name: /sello ilustrado de desarrollo seguro/i,
  });
  await expect(link).toBeVisible();
  await link.scrollIntoViewIfNeeded();
  await expect(link.locator("img")).toHaveJSProperty("naturalWidth", 128);
  await link.click();

  await expect(page).toHaveURL(/\/desarrollo-seguro\/#sello$/);
  await expect(page.locator("#sello")).toBeInViewport();
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    "/assets/desarrollo-seguro/logo-l4.webp",
  );
  await expect(page.locator(".academic-note")).toContainText(
    /prototipo académico[\s\S]*sin certificación[\s\S]*oficial/i,
  );
  await expect(
    page.getByRole("heading", { name: /buenas prácticas/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /grumphya como cliente/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /sello comprobable/i }),
  ).toBeVisible();
  const themeSwitch = page.getByRole("checkbox", { name: "Modo oscuro" });
  const themeSwitchLabel = page.locator(".theme-toggle");
  await themeSwitchLabel.click();
  await expect(themeSwitch).toBeChecked();
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(11, 23, 40)",
  );
  await themeSwitchLabel.click();
  await expect(themeSwitch).not.toBeChecked();

  await expect(page.locator(".company-mark")).toHaveJSProperty(
    "naturalWidth",
    640,
  );
  await expect(page.locator(".seal-preview img")).toHaveJSProperty(
    "naturalWidth",
    128,
  );

  const verificationLink = page.getByRole("link", {
    name: /comprobar el sello|ver ficha pública/i,
  });
  await expect(verificationLink).toHaveAttribute("href", VERIFICATION_URL);
  await verificationLink.click();

  await expect(page).toHaveURL(new RegExp(`${VERIFICATION_URL}$`));
  await expect(
    page.getByRole("heading", { name: "Ficha pública de verificación" }),
  ).toBeVisible();
  await expect(page.getByText("grumphya.com")).toBeVisible();
  await expect(page.getByText("Privacidad orientada al RGPD")).toBeVisible();
  await expect(
    page.getByText(/sin certificación oficial ni auditoría independiente/i),
  ).toBeVisible();
});

test("keeps the seal and verification within mobile width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.route("**/api/accreditations/**", (route) =>
    route.fulfill({ json: ACADEMIC_RECORD }),
  );
  await page.goto("/precios");
  const link = page.getByRole("link", {
    name: /sello ilustrado de desarrollo seguro/i,
  });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/desarrollo-seguro\/#sello$/);
  await expect(page.locator("#sello")).toBeInViewport();
  await expect(page.locator(".academic-note")).toContainText(
    /prototipo académico[\s\S]*sin certificación[\s\S]*oficial/i,
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("keeps verification text readable on dark backgrounds in dark mode", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("grumphya-theme", "dark");
  });
  await page.route("**/api/accreditations/**", (route) =>
    route.fulfill({ json: ACADEMIC_RECORD }),
  );
  await page.goto(VERIFICATION_URL);

  const verificationCard = page.locator(".accreditation-verification");
  const assuranceCard = page.locator(".accreditation-assurance");
  await expect(page.locator(".app-page")).toHaveClass(/theme-dark/);
  await expect(verificationCard).toHaveCSS(
    "background-color",
    "rgb(32, 60, 59)",
  );
  await expect(verificationCard).toHaveCSS("color", "rgb(243, 255, 243)");
  await expect(assuranceCard).toHaveCSS("background-color", "rgb(49, 92, 86)");
  await expect(assuranceCard).toHaveCSS("color", "rgb(243, 255, 243)");
});

test("secure-development prototype uses no third parties or cookies", async ({
  page,
  context,
  baseURL,
}) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  const appOrigin = new URL(baseURL).origin;
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== appOrigin) {
      externalRequests.push(request.url());
    }
  });
  await page.goto("/desarrollo-seguro/");
  await expect(
    page.getByRole("heading", { name: /desarrollo seguro/i }),
  ).toBeVisible();

  expect(externalRequests).toEqual([]);
  expect(await context.cookies()).toEqual([]);
  await expect(page.locator("script")).toHaveCount(0);
  await expect(page.locator("form")).toHaveCount(0);
  await expect(
    page.locator('meta[http-equiv="Content-Security-Policy"]'),
  ).toHaveAttribute("content", /script-src 'none'/);
});

test("prototype explains the operational report without presenting a scan result", async ({
  page,
}) => {
  await page.goto("/desarrollo-seguro/");

  const reportSection = page.locator("#estado");
  await expect(
    page.getByRole("link", { name: /estado del verificador/i }),
  ).toHaveAttribute("href", "#estado");
  await expect(
    page.getByRole("heading", { name: /sin informes operativos/i }),
  ).toBeVisible();
  await expect(reportSection).toContainText(/no se han realizado escaneos/i);
  await expect(
    reportSection.getByRole("heading", { name: /aún no está activo/i }),
  ).toBeVisible();

  const readinessRows = reportSection.locator(".status-row");
  await expect(
    reportSection.getByRole("list", { name: "Preparación del proyecto" }),
  ).toBeVisible();
  await expect(readinessRows).toHaveCount(4);
  await expect(readinessRows.nth(0)).toContainText("Listo en local");
  await expect(readinessRows.nth(1)).toContainText("Listo en local");
  await expect(readinessRows.nth(2)).toContainText("Pendiente");
  await expect(readinessRows.nth(3)).toContainText("Pendiente");

  const reportFields = reportSection.locator(".report-fields");
  await expect(reportFields.locator("dd").nth(0)).toHaveText(
    "El sitio solicitado",
  );
  await expect(reportFields.locator("dd").nth(1)).toHaveText(
    "/ · /precios · /acreditaciones/DS-GRUMPHYA-2026-001",
  );
  await expect(reportFields.locator("dt").nth(1)).toHaveText("Rutas previstas");
  await expect(reportFields.locator("dd").nth(2)).toContainText("VPS");

  const reportDetails = page.locator("details.report-details");
  await expect(reportDetails).toHaveAttribute("open", "");
  await expect(reportDetails).toContainText("grumphya.com");
  await expect(reportDetails).toContainText(
    "no desde una entidad independiente",
  );

  const reportSummary = reportDetails.locator("summary");
  await expect(reportSummary).toHaveText(/qué incluirá un informe/i);
  await reportSummary.focus();
  await reportSummary.press("Enter");
  await expect(reportDetails).not.toHaveAttribute("open", "");
  await reportSummary.press("Enter");
  await expect(reportDetails).toHaveAttribute("open", "");
  await expect(reportSection).toContainText(/medido desde el VPS/i);

  await page.setViewportSize({ width: 320, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
});

test("returns 404 for unknown secure-development prototype subpaths", async ({
  request,
}) => {
  const canonicalResponse = await request.get("/desarrollo-seguro", {
    maxRedirects: 0,
  });
  expect(canonicalResponse.status()).toBe(308);
  expect(canonicalResponse.headers().location).toBe("/desarrollo-seguro/");

  const response = await request.get("/desarrollo-seguro/no-existe");

  expect(response.status()).toBe(404);
});
