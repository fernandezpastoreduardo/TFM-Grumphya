import { expect, test, type Page } from "@playwright/test";

const HOME_URL = "/";
const IDEA_CONTINUE_BUTTON = ".idea-submit";
const IDEA_CHARACTER_COUNTER = ".idea-input-meta [aria-live='polite']";
const WCAG_AA_TEXT_CONTRAST = 4.5;

async function getContrastRatio(page: Page, selector: string) {
  return page.locator(selector).evaluate((element) => {
    const parseColor = (color: string) => {
      const channels = [...color.matchAll(/[\d.]+/g)].map(([value]) =>
        Number(value),
      );
      return {
        red: channels[0] ?? 0,
        green: channels[1] ?? 0,
        blue: channels[2] ?? 0,
        alpha: channels.length === 4 ? (channels[3] ?? 1) : 1,
      };
    };
    const luminance = (color: ReturnType<typeof parseColor>) => {
      const linearize = (channel: number) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      };

      return (
        0.2126 * linearize(color.red) +
        0.7152 * linearize(color.green) +
        0.0722 * linearize(color.blue)
      );
    };
    const foreground = parseColor(getComputedStyle(element).color);
    let background = parseColor("rgba(0, 0, 0, 0)");
    let ancestor: HTMLElement | null = element as HTMLElement;

    while (ancestor && background.alpha < 1) {
      background = parseColor(getComputedStyle(ancestor).backgroundColor);
      ancestor = ancestor.parentElement;
    }

    const foregroundLuminance = luminance(foreground);
    const backgroundLuminance = luminance(background);
    const lighter = Math.max(foregroundLuminance, backgroundLuminance);
    const darker = Math.min(foregroundLuminance, backgroundLuminance);

    return (lighter + 0.05) / (darker + 0.05);
  });
}

test("keeps the Home form text at WCAG AA contrast", async ({ page }) => {
  await page.goto(HOME_URL);

  const continueButton = page.locator(IDEA_CONTINUE_BUTTON).first();
  const characterCounter = page.locator(IDEA_CHARACTER_COUNTER).first();
  await expect(continueButton).toBeVisible();
  await expect(characterCounter).toBeVisible();

  expect(
    await getContrastRatio(page, IDEA_CONTINUE_BUTTON),
  ).toBeGreaterThanOrEqual(WCAG_AA_TEXT_CONTRAST);
  expect(
    await getContrastRatio(page, IDEA_CHARACTER_COUNTER),
  ).toBeGreaterThanOrEqual(WCAG_AA_TEXT_CONTRAST);
});
