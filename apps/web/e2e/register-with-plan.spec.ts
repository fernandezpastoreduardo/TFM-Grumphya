import { expect, test } from "@playwright/test";

const EMAIL = "persona-e2e@example.es";
const USERNAME = "PersonaE2EIdentificadorLong123";
const PASSWORD = "Una contraseña segura para e2e 2026!";
const REGISTER_BUTTON_NAME = /crear cuenta y verificar correo/i;

test("opens the registration plans from navigation and reaches the form", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/crear-cuenta\/planes$/);
  await expect(
    page.getByRole("heading", {
      name: "Para crear tu cuenta, primero elige un plan",
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: /elegir iluminado/i }).click();
  await expect(page).toHaveURL(/\/crear-cuenta$/);
  await expect(
    page.getByRole("heading", { name: /una cuenta\. un plan/i }),
  ).toBeVisible();
  await expect(page.getByText(/plan seleccionado: iluminado/i)).toBeVisible();
});

test("verifies the registration, activates the simulated purchase and deletes the account from the profile", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/precios");
  await page.getByRole("button", { name: /elegir faltón/i }).click();
  await expect(page).toHaveURL(/\/crear-cuenta$/);
  await expect(
    page.getByRole("heading", { name: /una cuenta\. un plan/i }),
  ).toBeVisible();
  await expect(page.getByText(/plan seleccionado: faltón/i)).toBeVisible();

  await page.getByLabel("Correo electrónico").fill(EMAIL);
  await page.getByLabel("Nombre de usuario").fill(USERNAME);
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Repite la contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: REGISTER_BUTTON_NAME }).click();
  await expect(page.getByRole("alert")).toContainText(
    /debes confirmar que has leído/i,
  );

  await page
    .getByRole("checkbox", { name: /he leído la política de privacidad/i })
    .check();
  const registrationResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/registrations") &&
      response.request().method() === "POST",
  );
  const submitClick = page
    .getByRole("button", { name: REGISTER_BUTTON_NAME })
    .click();
  const [registrationResponse] = await Promise.all([
    registrationResponsePromise,
    submitClick,
  ]);
  expect(registrationResponse.status()).toBe(201);
  await expect(
    page.getByRole("heading", { name: "Revisa tu correo" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    /no se activa la cuenta ni el plan hasta que confirmes el correo/i,
  );

  const previewResponse = await page.request.get(
    "/api/dev/mail-preview/latest",
  );
  expect(previewResponse.ok()).toBe(true);
  const mailPreview: unknown = await previewResponse.json();
  expect(mailPreview).toMatchObject({ to: EMAIL });
  const verificationText =
    typeof mailPreview === "object" &&
    mailPreview !== null &&
    "text" in mailPreview &&
    typeof mailPreview.text === "string"
      ? mailPreview.text
      : "";
  const verificationLink = verificationText.match(
    /https?:\/\/\S+\/verificar-cuenta#[a-f0-9]+/,
  )?.[0];
  expect(verificationLink).toBeDefined();
  await page.goto(verificationLink!);
  await expect(
    page.getByRole("heading", { name: "Confirma tu correo" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirmar correo" }).click();
  await expect(
    page.getByRole("heading", { name: "Correo verificado" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirmar contratación simulada" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Contratación simulada completada",
    }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    /no se ha procesado ningún pago/i,
  );

  await page.goto("/login");
  await expect(page).toHaveURL(/\/perfil$/);

  await expect(page.getByRole("heading", { name: USERNAME })).toBeVisible();
  const profileMascot = page.locator(".section-hero-mascot.mascot-profile");
  await expect(profileMascot).toBeVisible();
  await expect
    .poll(() =>
      profileMascot.evaluate(
        (element) => getComputedStyle(element).backgroundImage,
      ),
    )
    .toContain("/assets/grumphya/profile-account-shield.svg");
  await expect(page.getByText(EMAIL)).toBeVisible();
  await expect(page.getByRole("link", { name: "Mi cuenta" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cerrar sesión" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Faltón" })).toBeVisible();
  await expect(
    page.getByText(/11 de 11 envíos disponibles hoy/i),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /tus últimas ideas aprobadas/i }),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const profileViewportOverflow = await page.evaluate(() => {
    const profilePage = document.querySelector(".profile-page");
    const profileCards = document.querySelectorAll(
      ".profile-account-card, .profile-plans-section, .profile-ideas-card",
    );
    if (!profilePage) return ["profile page missing"];
    return [profilePage, ...Array.from(profileCards)]
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => element.className);
  });
  expect(profileViewportOverflow).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1280, height: 800 });

  await page
    .getByRole("switch", { name: "Activar modo oscuro" })
    .click({ force: true });
  await expect(
    page.getByRole("switch", { name: "Activar modo claro" }),
  ).toHaveAttribute("aria-checked", "true");
  await expect
    .poll(() =>
      page
        .locator(".profile-renewal-note")
        .evaluate((element) => getComputedStyle(element).color),
    )
    .toBe("rgb(23, 33, 35)");
  await expect
    .poll(() =>
      page
        .locator(".profile-delete-section")
        .evaluate((element) => getComputedStyle(element).color),
    )
    .toBe("rgb(23, 33, 35)");

  await page.goto("/login");
  await expect(page).toHaveURL(/\/perfil$/);
  const logoutResponsePromise = page.waitForResponse("**/api/auth/logout");
  await page
    .getByRole("button", { name: "Cerrar sesión" })
    .click({ force: true });
  const logoutResponse = await logoutResponsePromise;
  expect(logoutResponse.status()).toBe(201);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Entrar" })).toBeVisible();
  await page.goto("/perfil");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", {
      name: "¿Vienes a por más? Estupendo, tengo servidores para eso y más.",
    }),
  ).toBeVisible();
  const protectedProfileStatus = await page.evaluate(async () => {
    const response = await fetch("/api/account/profile");
    return response.status;
  });
  expect(protectedProfileStatus).toBe(401);

  await page.getByLabel("Usuario o correo").fill(USERNAME);
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
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
