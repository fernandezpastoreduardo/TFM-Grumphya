import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorPages, ErrorPagesBoundary } from "./error-pages";

describe("ErrorPages", () => {
  it.each([
    ["404", "Por aquí no hay ninguna sección."],
    ["429", "Ya está, te las has ingeniado"],
    ["500", "Algo se ha torcido por aquí."],
  ] as const)("presents the %s error with its next action", (status, copy) => {
    render(<ErrorPages status={status} />);

    expect(
      screen.getByRole("heading", { level: 1, name: status }),
    ).toBeVisible();
    expect(screen.getByText(new RegExp(copy))).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: status === "429" ? /entendido/i : /volver al inicio/i,
      }),
    ).toHaveAttribute("href", "/");
  });

  it("shows the specific retry window for the anti-abuse rate limit", () => {
    render(
      <ErrorPages status="429" detail="Vuelve a intentarlo dentro de 5 min." />,
    );

    expect(screen.getByText(/dentro de 5 min/i)).toBeVisible();
  });

  it("retries the failed render when requested from the 500 page", () => {
    const onRetry = vi.fn();
    render(<ErrorPages status="500" onRetry={onRetry} />);

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("catches render failures and shows the 500 page without logging error details", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    function BrokenContent(): never {
      throw new Error("sensitive component details");
    }

    render(
      <ErrorPagesBoundary>
        <BrokenContent />
      </ErrorPagesBoundary>,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "500" }),
    ).toBeVisible();
    expect(consoleError).toHaveBeenCalledWith("UI_RENDER_FAILURE");
    expect(consoleError).not.toHaveBeenCalledWith(
      expect.stringContaining("sensitive component details"),
    );
    consoleError.mockRestore();
  });
});
