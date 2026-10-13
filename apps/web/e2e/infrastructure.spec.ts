import { expect, test } from "@playwright/test";

const IDEA_TEXT_FIRST = "Una app para coordinar voluntarios en el barrio";
const IDEA_TEXT_SECOND = "Una app para compartir herramientas en el vecindario";
const READINESS_PATH = "/api/test-ready";
const EVALUATION_PATH = "/api/evaluation-process";
const NEUTRAL_MESSAGE =
  "Con lo que cuentas no veo un fallo de bulto, aunque eso todavía no demuestra que alguien vaya a usarlo.";

test("evaluates successive ideas through the UI, HTTP endpoint, and test fake", async ({
  page,
  request,
}) => {
  const readinessResponse = await request.get(READINESS_PATH);
  expect(readinessResponse.ok()).toBeTruthy();

  const directResponse = await request.post(EVALUATION_PATH, {
    data: { ideaText: IDEA_TEXT_FIRST, tone: "soft" },
  });
  expect(directResponse.status()).toBe(201);
  expect(await directResponse.json()).toEqual({
    status: "SIN_BLOQUEO_EVIDENTE",
    score: 7.15,
    headline: "Bueno, de momento no se cae por lo más obvio.",
    message: NEUTRAL_MESSAGE,
  });

  const submissionPayloads: unknown[] = [];
  let unexpectedDialog = false;
  page.on("request", (browserRequest) => {
    if (
      browserRequest.method() === "POST" &&
      browserRequest.url() ===
        `${new URL(page.url()).origin}/api/evaluation-process`
    ) {
      submissionPayloads.push(
        JSON.parse(browserRequest.postData() ?? "null") as unknown,
      );
    }
  });
  page.on("dialog", async (dialog) => {
    unexpectedDialog = true;
    await dialog.dismiss();
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /venga, al lío/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: /qué aplicación/i }),
  ).toBeVisible();

  const resultRegion = page.getByRole("region", {
    name: /resultado de la evaluación/i,
  });
  await expect(resultRegion).toBeEmpty();
  await page.getByRole("button", { name: /^a ver qué tienes/i }).click();
  await expect(page.getByRole("alert")).toContainText(/hay aire/i);

  const ideaInput = page.getByRole("textbox", { name: /qué aplicación/i });
  await ideaInput.fill(IDEA_TEXT_FIRST);
  await page.getByRole("radio", { name: /dame tu mejor golpe/i }).check();
  await page.getByRole("button", { name: /^a ver qué tienes/i }).click();
  await expect(resultRegion.getByText("7,15/10")).toBeVisible();
  await expect(
    resultRegion.getByRole("heading", {
      name: /bueno, no se ha desmontado a la primera/i,
    }),
  ).toBeVisible();
  await expect(resultRegion.getByText(NEUTRAL_MESSAGE)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /a ver qué tienes/i }),
  ).toBeEnabled();

  await ideaInput.fill(IDEA_TEXT_SECOND);
  await page.getByRole("radio", { name: /dime qué opinas/i }).check();
  await page.getByRole("button", { name: /^a ver qué tienes/i }).click();
  await expect(resultRegion.getByText("7,15/10")).toBeVisible();
  await expect(
    resultRegion.getByRole("heading", {
      name: /bueno, de momento no se cae por lo más obvio/i,
    }),
  ).toBeVisible();
  await expect(resultRegion.getByText(NEUTRAL_MESSAGE)).toBeVisible();

  expect(submissionPayloads).toEqual([
    { ideaText: IDEA_TEXT_FIRST, tone: "hard" },
    { ideaText: IDEA_TEXT_SECOND, tone: "soft" },
  ]);
  expect(unexpectedDialog).toBe(false);
  await expect(page.locator("img")).toHaveCount(0);
});
