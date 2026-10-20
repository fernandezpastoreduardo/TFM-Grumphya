import { expect, test } from "@playwright/test";

const DISMISSED_STORAGE_KEY = "grumphya.cookie-notice.dismissed.v1";
const INITIAL_STORAGE_RESET_KEY = "e2e.cookie-notice.initial-storage-reset";

test("keeps the cookie notice dismissed while navigating between sections", async ({
  page,
}) => {
  await page.addInitScript(
    ({ dismissedKey, resetKey }) => {
      if (
        window.location.origin !== "null" &&
        sessionStorage.getItem(resetKey) !== "done"
      ) {
        localStorage.removeItem(dismissedKey);
        sessionStorage.setItem(resetKey, "done");
      }
    },
    {
      dismissedKey: DISMISSED_STORAGE_KEY,
      resetKey: INITIAL_STORAGE_RESET_KEY,
    },
  );
  await page.goto("/");

  const notice = page.getByRole("dialog", {
    name: "Ni galletitas ni galletitos",
  });
  await expect(notice).toBeVisible();
  await page
    .getByRole("button", { name: "Denegar y continuar sin galletas" })
    .click();
  await expect(notice).toHaveCount(0);

  await page.getByRole("link", { name: "Planes", exact: true }).click();
  await expect(page).toHaveURL(/\/precios$/);

  await expect(
    page.getByRole("heading", { name: /once usos\. sí, once/i }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /once usos\. sí, once/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Ni galletitas ni galletitos" }),
  ).toHaveCount(0);
});
