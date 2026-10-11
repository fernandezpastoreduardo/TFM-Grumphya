import { expect, test } from "@playwright/test";

test("home captures ideas safely and reaches the API and pgvector database", async ({
  page,
  request,
}) => {
  await expect
    .poll(
      async () =>
        (await request.get("http://127.0.0.1:3000/api/health")).status(),
      {
        timeout: 30_000,
        message: "NestJS API and its database dependency should become ready",
      },
    )
    .toBe(200);

  const directHealth = await request.get("http://127.0.0.1:3000/api/health");
  const proxiedHealth = await request.get("/api/health");
  for (const response of [directHealth, proxiedHealth]) {
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toMatchObject({ status: "ok", database: "ok" });
    expect(data.pgvector).toMatch(/^\d+\.\d+\.\d+$/);
  }

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /venga, al lío/i }),
  ).toBeVisible();
  await expect(page.getByText(/servicios listos · postgresql/i)).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: /qué aplicación/i }),
  ).toBeVisible();
  const resultRegion = page.getByRole("region", {
    name: /resultado de la evaluación/i,
  });
  await expect(resultRegion).toBeEmpty();

  await page.getByRole("button", { name: /^a ver qué tienes/i }).click();
  await expect(page.getByRole("alert")).toContainText(/hay aire/i);

  await page
    .getByRole("textbox", { name: /qué aplicación/i })
    .fill('<img src=x onerror="alert(1)">');
  await page.getByRole("button", { name: /^a ver qué tienes/i }).click();
  await expect(resultRegion).toContainText(
    /el análisis aún no está conectado/i,
  );
  await expect(page.locator("img")).toHaveCount(0);

  await page.getByRole("button", { name: /activar modo oscuro/i }).click();
  await expect(page.locator(".home-page")).toHaveClass(/theme-dark/);
});
