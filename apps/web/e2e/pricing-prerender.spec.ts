import { expect, test } from "@playwright/test";

const PRICING_ROUTE = "/precios";
const PRICING_HERO = "Once usos. Sí, once.";

test("serves the pricing page content in the initial HTML and hydrates it", async ({
  page,
  request,
}) => {
  const response = await request.get(PRICING_ROUTE);
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain(PRICING_HERO);

  await page.goto(PRICING_ROUTE);
  await expect(page.getByRole("heading", { name: PRICING_HERO })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Elegir Iluminado/ }),
  ).toBeEnabled();
});
