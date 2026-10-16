import { expect, test } from "@playwright/test";

const ERROR_PREVIEW_PATH = (status: string) => `/__preview/errors/${status}`;

test.describe("error pages", () => {
  test("shows the unknown-route page and returns to Home", async ({ page }) => {
    await page.goto("/ruta-que-no-existe");

    await expect(
      page.getByRole("heading", { name: "404", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText("Por aquí no hay ninguna sección."),
    ).toBeVisible();
    await page.getByRole("link", { name: /volver al inicio/i }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("heading", { name: /antes de construirla/i }),
    ).toBeVisible();
  });

  test("previews the rate limit and server error pages", async ({ page }) => {
    await page.goto(ERROR_PREVIEW_PATH("429"));
    await expect(
      page.getByRole("heading", { name: "429", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText(/servidor te pida que te calles/i),
    ).toBeVisible();

    await page.goto(ERROR_PREVIEW_PATH("500"));
    await expect(
      page.getByRole("heading", { name: "500", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText("No se ha guardado ninguna evaluación incompleta."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reintentar" }),
    ).toBeVisible();
  });
});
