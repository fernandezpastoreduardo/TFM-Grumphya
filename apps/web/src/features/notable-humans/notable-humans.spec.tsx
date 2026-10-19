import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotableHumans } from "./notable-humans";

afterEach(() => vi.unstubAllGlobals());

describe("NotableHumans", () => {
  it("loads the ranking from the API and retains the prototype callout", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json([{ username: "laura_critica", approvedIdeasCount: 18 }], {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<NotableHumans />);

    await waitFor(() => {
      expect(screen.getByText("@laura_critica")).toBeInTheDocument();
    });
    expect(
      screen.getByText("La próxima idea brillante podría ser tuya."),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/best-users", {
      signal: expect.any(AbortSignal),
      credentials: "omit",
    });
  });

  it("shows an empty state when the API has no ranked users", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([])));

    render(<NotableHumans />);

    expect(
      await screen.findByText(/aún no hay humanos notables/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("lets the user retry a failed request and renders the returned ranking", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ message: "unavailable" }, { status: 503 }),
      )
      .mockResolvedValueOnce(
        Response.json([{ username: "laura_critica", approvedIdeasCount: 18 }]),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<NotableHumans />);

    await screen.findByRole("alert");
    await user.click(
      screen.getByRole("button", { name: "Volver a intentarlo" }),
    );

    expect(await screen.findByText("@laura_critica")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
