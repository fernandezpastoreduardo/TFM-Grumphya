import { expect, test } from "@playwright/test";

const IDEA_TEXT_FIRST = "Una app para coordinar voluntarios en el barrio";
const IDEA_TEXT_SECOND = "Una app para compartir herramientas en el vecindario";
const READINESS_PATH = "/api/test-ready";
const EVALUATION_PATH = "/api/evaluation-process";
const WEB_ORIGIN = `http://127.0.0.1:${process.env.PLAYWRIGHT_WEB_PORT ?? "5190"}`;
const IDEMPOTENCY_KEY = "25e7b3b5-1d57-4c89-9b89-5e7b8374d912";
const SOFT_MESSAGE =
  "¡Qué ilusión poder acompañarte con todo el cariño! La idea concreta ofrece una utilidad reconocible para quien necesita organizar este trabajo. Sin embargo, la descripción no explica cómo se comprueba que el resultado sea correcto ni cómo se distingue de otras opciones. Conviene validar primero esa diferencia y la confianza en el material final.";

test("evaluates successive ideas through the UI, HTTP endpoint, and test fake", async ({
  page,
  request,
}) => {
  const readinessResponse = await request.get(READINESS_PATH);
  expect(readinessResponse.ok()).toBeTruthy();

  const directResponse = await request.post(EVALUATION_PATH, {
    data: { ideaText: IDEA_TEXT_FIRST, tone: "soft" },
    headers: { Origin: WEB_ORIGIN, "Idempotency-Key": IDEMPOTENCY_KEY },
  });
  expect(directResponse.status()).toBe(201);
  expect(await directResponse.json()).toEqual({
    status: "evaluated",
    result: {
      status: "SIN_BLOQUEO_EVIDENTE",
      score: 8.57,
      headline: "La idea pasa este primer repaso, con confeti prudente.",
      message: SOFT_MESSAGE,
    },
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
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("heading", { name: /antes de construirla/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: /escribe o pega tu idea/i }),
  ).toBeVisible();

  const resultRegion = page.getByRole("region", {
    name: /resultado de la evaluación/i,
  });
  await expect(resultRegion).toBeEmpty();
  await page.getByRole("button", { name: /adelante/i }).click();
  await expect(page.getByRole("alert")).toContainText(/hay aire/i);

  const ideaInput = page.getByRole("textbox", {
    name: /escribe o pega tu idea/i,
  });
  await ideaInput.fill(IDEA_TEXT_FIRST);
  await page.getByRole("button", { name: /adelante/i }).click();
  await page.getByRole("radio", { name: /dame tu mejor golpe/i }).check();
  await page.getByRole("button", { name: /evaluar idea/i }).click();
  const evaluationDialog = page.getByRole("dialog", {
    name: /resultado de la evaluación/i,
  });
  await expect(evaluationDialog.getByText(/\d,\d{2}\/10/)).toBeVisible();
  await expect(
    evaluationDialog
      .getByRole("article", { name: /resultado de tu idea/i })
      .getByRole("heading"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /evaluar idea/i }),
  ).toBeEnabled();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /cerrar resultado/i }).click();
  const reopenEvaluationButton = page.getByRole("button", {
    name: "Volver a ver la evaluación",
  });
  await expect(reopenEvaluationButton).toBeVisible();
  const reopenButtonBox = await reopenEvaluationButton.boundingBox();
  const resultRegionBox = await resultRegion.boundingBox();
  expect(reopenButtonBox).not.toBeNull();
  expect(resultRegionBox).not.toBeNull();
  expect(
    Math.abs(
      reopenButtonBox!.x +
        reopenButtonBox!.width / 2 -
        (resultRegionBox!.x + resultRegionBox!.width / 2),
    ),
  ).toBeLessThanOrEqual(1);

  await expect(ideaInput).toHaveValue(IDEA_TEXT_FIRST);
  await ideaInput.fill(IDEA_TEXT_SECOND);
  await page.getByRole("button", { name: /adelante/i }).click();
  await page.getByRole("radio", { name: /tengo la piel fina/i }).check();
  await page.getByRole("button", { name: /evaluar idea/i }).click();
  await expect(evaluationDialog.getByText(/\d,\d{2}\/10/)).toBeVisible();
  await expect(
    evaluationDialog
      .getByRole("article", { name: /resultado de tu idea/i })
      .getByRole("heading"),
  ).toBeVisible();

  expect(submissionPayloads).toEqual([
    { ideaText: IDEA_TEXT_FIRST, tone: "hard" },
    { ideaText: IDEA_TEXT_SECOND, tone: "soft" },
  ]);
  expect(unexpectedDialog).toBe(false);
  await expect(
    evaluationDialog
      .getByRole("article", { name: /resultado de tu idea/i })
      .locator("img"),
  ).toHaveCount(0);
});
