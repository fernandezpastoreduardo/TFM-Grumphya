import { expect, test } from "@playwright/test";

const EMAIL = "persona-e2e@example.es";
const USERNAME = "personaE2E";
const PASSWORD = "Una contraseña segura para e2e 2026!";

test("selects a plan, verifies through the isolated test sink and confirms the simulated purchase", async ({ page }) => {
  await page.goto("/precios");
  await page.getByRole("button", { name: /elegir faltón/i }).click();
  await expect(page).toHaveURL(/\/crear-cuenta$/);
  await expect(page.getByRole("heading", { name: /una cuenta\. un plan/i })).toBeVisible();
  await expect(page.getByText(/plan seleccionado: faltón/i)).toBeVisible();

  await page.getByLabel("Correo electrónico").fill(EMAIL);
  await page.getByLabel("Nombre de usuario").fill(USERNAME);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: /^crear cuenta/i }).click();
  await expect(page.getByRole("alert")).toContainText(/debes confirmar que has leído/i);

  await page.getByRole("checkbox", { name: /he leído la política de privacidad/i }).check();
  await page.getByRole("button", { name: /^crear cuenta/i }).click();
  await expect(page.getByRole("heading", { name: /continúa con la verificación de prueba/i })).toBeVisible();
  await expect(page.getByText(/no se envía un correo real/i)).toBeVisible();
  await expect(page.getByText(/la cuenta y el plan aún no están activos/i)).toBeVisible();

  await page.getByRole("button", { name: /abrir enlace de verificación de pruebas/i }).click();
  await expect(page).toHaveURL(/\/verificar-cuenta$/);
  await expect(page.getByRole("heading", { name: /correo verificado/i })).toBeVisible();
  await expect(page.getByText(/todavía no está activo/i)).toBeVisible();

  await page.getByRole("button", { name: /confirmar contratación simulada/i }).click();
  await expect(page.getByRole("heading", { name: /contratación simulada completada/i })).toBeVisible();
  await expect(page.getByRole("status")).toContainText(/plan faltón está activo en el servidor/i);
});
