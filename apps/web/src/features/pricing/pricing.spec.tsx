import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Pricing } from "./pricing";

const LOCATION_DESCRIPTOR = Object.getOwnPropertyDescriptor(window, "location");

afterEach(() => {
  if (LOCATION_DESCRIPTOR)
    Object.defineProperty(window, "location", LOCATION_DESCRIPTOR);
});

function jsonResponse(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Pricing registration intent", () => {
  it("posts the selected plan then navigates to a clean registration URL", async () => {
    const user = userEvent.setup();
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ status: "created" })),
    );
    render(<Pricing />);

    await user.click(screen.getByRole("button", { name: /elegir iluminado/i }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/registration-intents",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ plan: "ILUMINADO" }),
      }),
    );
    expect(assign).toHaveBeenCalledWith("/crear-cuenta");
  });

  it("keeps the user on pricing and shows an error when the intent fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 503)));
    render(<Pricing />);

    await user.click(screen.getByRole("button", { name: /elegir faltón/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no se ha podido seleccionar el plan/i,
    );
  });
});
