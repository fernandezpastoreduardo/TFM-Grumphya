import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoastRanking } from "./RoastRanking";

const RANKING = [
  { username: "GrumpyWinner", roastMessagesSent: 30 },
  { username: "TeaSpiller", roastMessagesSent: 21 },
  { username: "IdeaGoblin", roastMessagesSent: 11 },
];

describe("RoastRanking", () => {
  it("shows the winner outside a table and only the remaining ranked users in it", () => {
    render(
      <RoastRanking
        state={{ status: "success", ranking: RANKING }}
        onRetry={vi.fn()}
      />,
    );

    const winner = screen.getByLabelText("Ganador del ranking de roast");
    expect(within(winner).getByText("GrumpyWinner")).toBeInTheDocument();
    expect(
      within(winner).getByText("30 mensajes de roast"),
    ).toBeInTheDocument();

    const table = screen.getByRole("table", {
      name: "Puestos del 2 al 10 del ranking de roast",
    });
    expect(within(table).getByText("TeaSpiller")).toBeInTheDocument();
    expect(within(table).getByText("21")).toBeInTheDocument();
    expect(within(table).getByText("IdeaGoblin")).toBeInTheDocument();
    expect(within(table).getByText("11")).toBeInTheDocument();
    expect(within(table).queryByText("GrumpyWinner")).not.toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(3);
  });

  it("shows an empty state when there are no ranked accounts", () => {
    render(
      <RoastRanking
        state={{ status: "success", ranking: [] }}
        onRetry={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Todavía no hay usuarios en el ranking/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows loading and retryable error states accessibly", async () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <RoastRanking state={{ status: "loading" }} onRetry={onRetry} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/cargando/i);

    rerender(<RoastRanking state={{ status: "error" }} onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    screen.getByRole("button", { name: "Volver a intentarlo" }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("never renders more than ten places", () => {
    const ranking = Array.from({ length: 12 }, (_, index) => ({
      username: `user-${index + 1}`,
      roastMessagesSent: 12 - index,
    }));
    render(
      <RoastRanking state={{ status: "success", ranking }} onRetry={vi.fn()} />,
    );

    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(10);
    expect(within(table).queryByText("user-11")).not.toBeInTheDocument();
  });
});
