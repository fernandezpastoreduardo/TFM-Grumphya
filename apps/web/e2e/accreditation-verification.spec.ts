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

test("opens the server-backed public verification from the home footer", async ({
  page,
}) => {
  await page.route("**/api/accreditations/**", (route) =>
    route.fulfill({ json: ACADEMIC_RECORD }),
  );
  await page.goto("/");

  const link = page.getByRole("link", {
    name: "Verificar demostración de Desarrollo Seguro para Grumphya",
  });
  await expect(link).toBeVisible();
  await link.scrollIntoViewIfNeeded();
  await expect(link.locator("img")).toHaveJSProperty("naturalWidth", 512);
  await link.click();

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
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/accreditations/**", (route) =>
    route.fulfill({ json: ACADEMIC_RECORD }),
  );
  await page.goto("/precios");
  const link = page.getByRole("link", {
    name: "Verificar demostración de Desarrollo Seguro para Grumphya",
  });
  await expect(link).toBeVisible();
  await link.click();
  await expect(
    page.getByText("Prototipo académico", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("public navigation makes no browser requests to third parties", async ({
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
  await page.route("**/api/accreditations/**", (route) =>
    route.fulfill({ json: ACADEMIC_RECORD }),
  );
  await page.goto("/");
  await page.goto("/precios");
  await page.goto(VERIFICATION_URL);
  await expect(
    page.getByRole("heading", { name: "Medidas y evidencias" }),
  ).toBeVisible();

  expect(externalRequests).toEqual([]);
  const appHost = new URL(page.url()).hostname;
  expect(
    (await context.cookies()).every((cookie) => cookie.domain === appHost),
  ).toBe(true);
});
