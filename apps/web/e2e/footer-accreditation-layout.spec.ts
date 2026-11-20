import { expect, test } from "@playwright/test";
import { mockDevelopmentSecurityBadge } from "./support/mock-development-security-badge";

const VERIFICATION_URL = "/acreditaciones/DS-GRUMPHYA-2026-001";
const NARROW_DESKTOP = { width: 980, height: 1000 };
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844 };
const RECORD = {
  id: "DS-GRUMPHYA-2026-001",
  issuer: "Grumphya · revisión interna",
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
  await mockDevelopmentSecurityBadge(page);
  await mockVerificationAndSession(page);
  await page.setViewportSize(DESKTOP);
  await page.goto(VERIFICATION_URL);

  const footer = page.locator(".site-footer");
  const badge = footer.locator("a[data-ds-verified-badge]");
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute("href", "https://desarrolloseguro.org/");
  await expect(badge).toContainText(
    "Sello verificado por desarrolloseguro.org",
  );

  const desktopLayout = await footer.evaluate((element) => {
    const children = Array.from(element.children).map((child) =>
      child.getBoundingClientRect(),
    );
    return {
      footerChildrenShareRow: children.every(
        (child) =>
          Math.abs(
            child.top +
              child.height / 2 -
              (children[0].top + children[0].height / 2),
          ) < 3,
      ),
    };
  });
  expect(desktopLayout).toEqual({ footerChildrenShareRow: true });

  await page.setViewportSize(MOBILE);
  await expect(badge).toBeVisible();
  await badge.scrollIntoViewIfNeeded();
  const mobileBadgeBox = await badge.boundingBox();
  expect(mobileBadgeBox).not.toBeNull();
  expect(mobileBadgeBox!.x + mobileBadgeBox!.width).toBeLessThanOrEqual(
    MOBILE.width,
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(MOBILE.width);

  await page.evaluate(() => {
    document.querySelector(".app-page")?.classList.add("theme-dark");
  });
  await expect(badge).toBeVisible();

  await page.setViewportSize(DESKTOP);
  await page.goto("/");
  const homeFooter = page.locator(".home-footer");
  const homeFooterNote = homeFooter.locator(".home-footer-note");
  const homeFooterBadge = homeFooter.locator("a[data-ds-verified-badge]");
  await expect(homeFooterNote).toBeVisible();
  await expect(homeFooterBadge).toBeVisible();
  await expect(homeFooterBadge).toHaveAttribute(
    "href",
    "https://desarrolloseguro.org/",
  );
  await page.evaluate(() => {
    document.querySelector(".home-page")?.classList.add("theme-dark");
  });
  await expect(homeFooterNote).toHaveCSS("color", "rgb(255, 255, 255)");
});
