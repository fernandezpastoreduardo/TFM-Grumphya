import { expect, test } from "@playwright/test";

const MOBILE_VIEWPORT = { width: 412, height: 823 };
const ROAST_PLAN_LINK = /ver el plan faltón/i;
const DARK_MODE_SWITCH = /activar modo oscuro/i;
const FIRST_SAMPLE_ROAST =
  "Quiero una app que haga mi trabajo mientras duermo.";
const NO_PREVIOUS_ROASTS = "No hay mensajes anteriores guardados.";
const ROAST_FAILURE_TITLE = "Se nos ha derramado el café";
const ROAST_RETRY_MESSAGE = "Quería un roast y me he encontrado un error.";
const ROAST_SUCCESS_REPLY = "Hasta el café tiene más iniciativa.";

function calculateContrastRatio(
  foregroundColor: string,
  backgroundColor: string,
) {
  const luminance = (color: string) => {
    const channels = color
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number);
    const linear = channels.map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const foreground = luminance(foregroundColor);
  const background = luminance(backgroundColor);
  return (
    (Math.max(foreground, background) + 0.05) /
    (Math.min(foreground, background) + 0.05)
  );
}

test("lets the roast thread follow its contents instead of forcing a minimum height on mobile", async ({
  page,
}) => {
  await page.setViewportSize(MOBILE_VIEWPORT);

  let releaseUsageResponse = () => {};
  const usageResponsePaused = new Promise<void>((resolve) => {
    releaseUsageResponse = resolve;
  });
  await page.route("**/api/anonymous-usage", async (route) => {
    await usageResponsePaused;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        ideas: { limit: 3, used: 0, remaining: 3 },
        roasts: { limit: 3, used: 0, remaining: 3 },
      }),
    });
  });

  await page.goto("/descargate");
  const thread = page.locator(".roast-thread");
  await expect(thread.locator(".roast-thread-skeleton")).toBeVisible();
  await expect
    .poll(() =>
      thread.evaluate((element) => getComputedStyle(element).minHeight),
    )
    .toBe("0px");
  await expect
    .poll(() =>
      thread.evaluate((element) => getComputedStyle(element).maxHeight),
    )
    .toBe("420px");

  releaseUsageResponse();
  await expect(page.getByText(FIRST_SAMPLE_ROAST)).toBeVisible();
  await expect(thread.locator(".roast-thread-skeleton")).toHaveCount(0);
});

test("shrinks the roast thread and moves the composer up when there is no history", async ({
  page,
}) => {
  await page.setViewportSize(MOBILE_VIEWPORT);

  let releaseUsageResponse = () => {};
  const usageResponsePaused = new Promise<void>((resolve) => {
    releaseUsageResponse = resolve;
  });
  await page.route("**/api/anonymous-usage", async (route) => {
    await usageResponsePaused;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        ideas: { limit: 3, used: 0, remaining: 3 },
        roasts: { limit: 3, used: 3, remaining: 0 },
      }),
    });
  });

  await page.goto("/descargate");
  await expect(page.locator(".roast-thread-skeleton")).toBeVisible();
  const composer = page.locator(".roast-composer");
  const initialComposerTop = (await composer.boundingBox())?.y;

  releaseUsageResponse();
  await expect(page.getByText(NO_PREVIOUS_ROASTS)).toBeVisible();
  const loadedComposerTop = (await composer.boundingBox())?.y;

  expect(initialComposerTop).toBeDefined();
  expect(loadedComposerTop).toBeDefined();
  expect(initialComposerTop! - loadedComposerTop!).toBeGreaterThan(20);
});

test("closes the roast failure modal, blocks the page behind it, and lets the user retry", async ({
  page,
}) => {
  let roastRequestCount = 0;
  await page.route("**/api/roast", async (route) => {
    roastRequestCount += 1;
    if (roastRequestCount === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          code: "ROAST_REPLY_UNAVAILABLE",
          message: "La respuesta de roast no está disponible.",
        }),
      });
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ reply: ROAST_SUCCESS_REPLY }),
    });
  });

  await page.goto("/descargate");
  const input = page.getByRole("textbox", { name: /tu insulto/i });
  await expect(input).toBeEnabled();
  await input.fill(ROAST_RETRY_MESSAGE);
  await page.getByRole("button", { name: /enviar insulto/i }).click();

  const dialog = page.getByRole("dialog", { name: ROAST_FAILURE_TITLE });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => dialog.evaluate((element) => element.matches(":modal")))
    .toBe(true);
  const backdropColor = await dialog.evaluate(
    (element) => getComputedStyle(element, "::backdrop").backgroundColor,
  );
  expect(backdropColor).not.toBe("rgba(0, 0, 0, 0)");

  await page.getByRole("button", { name: "Cerrar aviso" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(input).toHaveValue(ROAST_RETRY_MESSAGE);
  await page.getByRole("button", { name: /enviar insulto/i }).click();

  await expect(page.getByText(ROAST_SUCCESS_REPLY)).toBeVisible();
  await expect(dialog).not.toBeVisible();
  expect(roastRequestCount).toBe(2);
});

test("keeps the roast plan link readable in both themes on mobile", async ({
  page,
}) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.goto("/descargate");

  const planLink = page.getByRole("link", { name: ROAST_PLAN_LINK });
  await expect(planLink).toBeVisible();

  const contrastRatio = async () => {
    const colors = await planLink.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        foreground: style.color,
        background: style.backgroundColor,
      };
    });
    return calculateContrastRatio(colors.foreground, colors.background);
  };

  expect(await contrastRatio()).toBeGreaterThanOrEqual(4.5);
  await planLink.hover();
  expect(await contrastRatio()).toBeGreaterThanOrEqual(4.5);
  await page.getByRole("switch", { name: DARK_MODE_SWITCH }).click();
  expect(await contrastRatio()).toBeGreaterThanOrEqual(4.5);
  await planLink.hover();
  expect(await contrastRatio()).toBeGreaterThanOrEqual(4.5);
});
