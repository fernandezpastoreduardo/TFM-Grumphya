import { expect, test } from "@playwright/test";

const EMAIL = "persona-e2e@example.es";
const USERNAME = "personaE2E";
const PASSWORD = "Una contraseña segura para e2e 2026!";
const PAYMENT_NOTICE = "el pago es simulado y no se te cobrará nada";

test("selects a plan, activates the simulated purchase and manages it in the profile", async ({
  page,
}) => {
  await page.goto("/precios");
  await page.getByRole("button", { name: /elegir faltón/i }).click();
  await expect(page).toHaveURL(/\/crear-cuenta$/);
  await expect(
    page.getByRole("heading", { name: /una cuenta\. un plan/i }),
  ).toBeVisible();
  await expect(page.getByText(/plan seleccionado: faltón/i)).toBeVisible();

  await page.getByLabel("Correo electrónico").fill(EMAIL);
  await page.getByLabel("Nombre de usuario").fill(USERNAME);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page
    .getByRole("button", { name: /dáme de alta y te pago un café/i })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    /debes confirmar que has leído/i,
  );

  await page
    .getByRole("checkbox", { name: /he leído la política de privacidad/i })
    .check();
  await page
    .getByRole("button", { name: /dáme de alta y te pago un café/i })
    .click();
  await expect(
    page.getByRole("heading", {
      name: /un momento\. estoy preparando tu cuenta/i,
    }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(PAYMENT_NOTICE);
  await expect(page).toHaveURL(/\/perfil$/, { timeout: 7_000 });

  await expect(page.getByRole("heading", { name: USERNAME })).toBeVisible();
  await expect(page.getByText(EMAIL)).toBeVisible();
  await expect(page.getByText(/correo sin verificar/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Faltón" })).toBeVisible();
  await expect(
    page.getByText(/11 de 11 envíos disponibles hoy/i),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /tus últimas ideas aprobadas/i }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: /darme de baja del plan faltón/i })
    .click();
  await expect(
    page.getByText(/la baja de faltón se ha confirmado/i),
  ).toBeVisible();
  await expect(page.getByText(/0 de 11 envíos disponibles hoy/i)).toBeVisible();

  await page.getByRole("button", { name: "Darme de baja" }).click();
  const deletionDialog = page.getByRole("dialog", {
    name: "Esta acción no se puede deshacer",
  });
  await expect(deletionDialog).toContainText(/baja es inmediata e irreversible/i);
  await expect(deletionDialog).toContainText(/borrado es físico/i);
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Darme de baja" }).click();
  await page
    .getByRole("button", { name: "Confirmo que quiero darme de baja" })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: /antes de construirla/i }),
  ).toBeVisible();
});
