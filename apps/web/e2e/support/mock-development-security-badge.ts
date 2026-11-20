import type { Page } from "@playwright/test";

const DEVELOPMENT_SECURITY_BADGE_SCRIPT_URL =
  "https://desarrolloseguro.org/desarrollo-seguro/badge-widget.js";
const VERIFIED_BADGE_SCRIPT = `
const badge = document.querySelector('a[data-ds-verified-badge]');
if (badge) {
  badge.hidden = false;
  badge.href = "https://desarrolloseguro.org/";
  badge.textContent = "Sello verificado por desarrolloseguro.org";
}
`;

export function mockDevelopmentSecurityBadge(page: Page) {
  return page.route(DEVELOPMENT_SECURITY_BADGE_SCRIPT_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: VERIFIED_BADGE_SCRIPT,
    }),
  );
}
