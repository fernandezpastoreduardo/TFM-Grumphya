import { expect, test } from "@playwright/test";

const VERIFICATION_URL = "/acreditaciones/DS-GRUMPHYA-2026-001";
const NARROW_DESKTOP = { width: 980, height: 1000 };
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844 };
const RECORD = {
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
  assurances: [],
  disclaimer:
    "Demostración académica, sin certificación oficial ni auditoría independiente.",
};

function getAccountProfile() {
  return {
    user: {
      role: "user",
      email: "persona@example.es",
      username: "PersonaE2E",
      emailVerified: true,
      createdAt: "2026-10-29T12:00:00.000Z",
      publicRankingsOptIn: false,
    },
    plans: ["ILUMINADO", "FALTON"].map((plan) => ({
      plan,
      status: "inactive",
      startsAt: null,
      expiresAt: null,
      attemptsRemaining: { ideas: 0, roasts: 0 },
    })),
  };
}

async function mockVerificationAndSession(
  page: import("@playwright/test").Page,
) {
  await page.route("**/api/accreditations/**", (route) =>
    route.fulfill({ json: RECORD }),
  );
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ accessToken: "e2e-overflow-session" }),
    }),
  );
  await page.route("**/api/account/profile", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(getAccountProfile()),
    }),
  );
}

test("keeps signed-in account actions beside the theme switch on public verification", async ({
  page,
}) => {
  await page.setViewportSize(NARROW_DESKTOP);
  await mockVerificationAndSession(page);
  await page.goto(VERIFICATION_URL);

  const header = page.locator(".site-header");
  const accountActions = header.locator(":scope > .account-actions-site");
  const themeToggle = header.locator(":scope > .site-theme-toggle");
  await expect(header).toHaveClass(/navigation-overflow/);
  await expect(
    accountActions.getByRole("link", { name: /mi cuenta/i }),
  ).toBeVisible();
  await expect(
    accountActions.getByRole("button", { name: /cerrar sesión/i }),
  ).toBeVisible();
  await expect(themeToggle).toBeVisible();

  const accountPosition = await accountActions.boundingBox();
  const themePosition = await themeToggle.boundingBox();
  expect(accountPosition).not.toBeNull();
  expect(themePosition).not.toBeNull();
  expect(
    Math.abs(
      accountPosition!.y +
        accountPosition!.height / 2 -
        (themePosition!.y + themePosition!.height / 2),
    ),
  ).toBeLessThan(2);
  expect(accountPosition!.x + accountPosition!.width).toBeLessThan(
    themePosition!.x,
  );
});

test("integrates the secure-development seal in desktop and mobile footers", async ({
  page,
}) => {
  await mockVerificationAndSession(page);
  await page.setViewportSize(DESKTOP);
  await page.goto(VERIFICATION_URL);

  const footer = page.locator(".site-footer");
  const seal = footer.locator(".accreditation-seal");
  const caption = seal.locator(".accreditation-seal-caption");
  await expect(seal).toBeVisible();
  await expect(caption).toContainText("Demostración académica");
  await expect(caption).toHaveCSS("color", "rgb(16, 27, 32)");

  const desktopLayout = await footer.evaluate((element) => {
    const children = Array.from(element.children).map((child) =>
      child.getBoundingClientRect(),
    );
    const sealElement = element.querySelector(".accreditation-seal");
    const sealImage = sealElement?.querySelector("img");
    const sealCaption = sealElement?.querySelector(
      ".accreditation-seal-caption",
    );
    if (!sealImage || !sealCaption) return null;
    const imageBox = sealImage.getBoundingClientRect();
    const captionBox = sealCaption.getBoundingClientRect();
    return {
      footerChildrenShareRow: children.every(
        (child) =>
          Math.abs(
            child.top +
              child.height / 2 -
              (children[0].top + children[0].height / 2),
          ) < 3,
      ),
      sealContentsShareRow:
        Math.abs(
          imageBox.top +
            imageBox.height / 2 -
            (captionBox.top + captionBox.height / 2),
        ) < 3,
    };
  });
  expect(desktopLayout).toEqual({
    footerChildrenShareRow: true,
    sealContentsShareRow: true,
  });

  await page.setViewportSize(MOBILE);
  await expect(seal).toBeVisible();
  await expect(caption).toBeVisible();
  await seal.scrollIntoViewIfNeeded();
  const mobileSealImage = seal.locator("img");
  await expect
    .poll(() => mobileSealImage.evaluate((image) => image.currentSrc))
    .toContain("sello-s4-mobile.webp");
  expect(
    await page.evaluate(async () => {
      const image = new Image();
      image.src = "/assets/desarrollo-seguro/sello-s4-mobile.webp";
      await image.decode();
      return image.naturalWidth;
    }),
  ).toBe(84);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(MOBILE.width);

  const mobileLayout = await seal.evaluate((element) => {
    const image = element.querySelector("img");
    const text = element.querySelector(".accreditation-seal-caption");
    if (!image || !text) return null;
    const imageBox = image.getBoundingClientRect();
    const textBox = text.getBoundingClientRect();
    return {
      imageBeforeCaption: imageBox.right <= textBox.left,
      sameRow:
        Math.abs(
          imageBox.top +
            imageBox.height / 2 -
            (textBox.top + textBox.height / 2),
        ) < 3,
    };
  });
  expect(mobileLayout).toEqual({ imageBeforeCaption: true, sameRow: true });

  await page.evaluate(() => {
    document.querySelector(".app-page")?.classList.add("theme-dark");
  });
  await expect(caption).toHaveCSS("color", "rgb(255, 255, 255)");

  await page.setViewportSize(DESKTOP);
  await page.goto("/");
  const homeFooter = page.locator(".home-footer");
  const homeFooterNote = homeFooter.locator(".home-footer-note");
  const homeFooterSeal = homeFooter.locator(".accreditation-seal");
  await expect(homeFooterNote).toBeVisible();
  await expect(homeFooterSeal).toBeVisible();
  const homeFooterLayout = await Promise.all([
    homeFooterNote.boundingBox(),
    homeFooterSeal.boundingBox(),
  ]);
  expect(homeFooterLayout[0]).not.toBeNull();
  expect(homeFooterLayout[1]).not.toBeNull();
  expect(
    Math.abs(
      homeFooterLayout[0]!.y +
        homeFooterLayout[0]!.height / 2 -
        (homeFooterLayout[1]!.y + homeFooterLayout[1]!.height / 2),
    ),
  ).toBeLessThan(7);
  await page.evaluate(() => {
    document.querySelector(".home-page")?.classList.add("theme-dark");
  });
  await expect(homeFooterNote).toHaveCSS("color", "rgb(255, 255, 255)");
});
