import { expect, test } from "@playwright/test";

const EMAIL = "persona-e2e@example.es";
const USERNAME = "personaE2E";
const PASSWORD = "Una contraseña segura para e2e 2026!";
const PAYMENT_NOTICE = "el pago es simulado y no se te cobrará nada";
const REGISTER_BUTTON_NAME = /dáme de alta.*pago.*café/i;

test("selects a plan, activates the simulated purchase and deletes the account from the profile", async ({
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
  await page.getByRole("button", { name: REGISTER_BUTTON_NAME }).click();
  await expect(page.getByRole("alert")).toContainText(
    /debes confirmar que has leído/i,
  );

  await page
    .getByRole("checkbox", { name: /he leído la política de privacidad/i })
    .check();
  await page.getByRole("button", { name: REGISTER_BUTTON_NAME }).click();
  await expect(
    page.getByRole("heading", {
      name: /un momento\. estoy preparando tu cuenta/i,
    }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(PAYMENT_NOTICE);
  await expect(page).toHaveURL(/\/perfil$/, { timeout: 7_000 });

  await expect(page.getByRole("heading", { name: USERNAME })).toBeVisible();
  const profileMascot = page.locator(".section-hero-mascot.mascot-profile");
  await expect(profileMascot).toBeVisible();
  await expect
    .poll(() =>
      profileMascot.evaluate((element) =>
        getComputedStyle(element).backgroundImage,
      ),
    )
    .toContain("/assets/grumphya/profile-account-shield.png");
  await expect(page.getByText(EMAIL)).toBeVisible();
  await expect(page.getByRole("link", { name: "Mi cuenta" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cerrar sesión" }),
  ).toBeVisible();
  await expect(page.getByText(/correo sin verificar/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Faltón" })).toBeVisible();
  await expect(
    page.getByText(/11 de 11 envíos disponibles hoy/i),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /tus últimas ideas aprobadas/i }),
  ).toBeVisible();

  await page.goto("/login");
  await expect(page).toHaveURL(/\/perfil$/);
  const logoutResponsePromise = page.waitForResponse("**/api/auth/logout");
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  const logoutResponse = await logoutResponsePromise;
  expect(logoutResponse.status()).toBe(201);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Entrar" })).toBeVisible();
  await page.goto("/perfil");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: /no, no tenemos login/i }),
  ).toBeVisible();
  const protectedProfileStatus = await page.evaluate(async () => {
    const response = await fetch("/api/account/profile");
    return response.status;
  });
  expect(protectedProfileStatus).toBe(401);

  await page.getByLabel("Usuario o correo").fill(USERNAME);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: /^entrar/i }).click();
  await expect(page).toHaveURL(/\/perfil$/);
  await expect(page.getByRole("heading", { name: USERNAME })).toBeVisible();

  await page
    .getByRole("button", { name: "Darme de baja y BORRAR MI CUENTA" })
    .click();
  const deletionDialog = page.getByRole("dialog", {
    name: "Esta acción no se puede deshacer",
  });
  await expect(deletionDialog).toContainText(
    /baja es inmediata e irreversible/i,
  );
  await expect(deletionDialog).toContainText(/borrado es físico/i);
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page
    .getByRole("button", { name: "Darme de baja y BORRAR MI CUENTA" })
    .click();
  await page
    .getByRole("button", { name: "Confirmo que quiero darme de baja" })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: /antes de construirla/i }),
  ).toBeVisible();
});
