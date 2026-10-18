import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BestUsers } from "./BestUsers";

const USERS = [
  { username: "laura_critica", approvedIdeasCount: 18 },
  { username: "pablo_sin_pitch", approvedIdeasCount: 13 },
  { username: "marta_beta", approvedIdeasCount: 9 },
];

describe("BestUsers", () => {
  it("uses a public avatar when an account has one", () => {
    render(
      <BestUsers
        state={{
          status: "success",
          users: [
            {
              username: "laura_critica",
              approvedIdeasCount: 18,
              avatarUrl:
                "/api/avatars/00000000-0000-4000-8000-000000000001.webp",
            },
          ],
        }}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByRole("list").querySelector("img")).toHaveAttribute(
      "src",
      "/api/avatars/00000000-0000-4000-8000-000000000001.webp",
    );
  });

  it("follows the prototype ranking with the winner highlighted and ten places max", () => {
    render(
      <BestUsers
        state={{ status: "success", users: USERS }}
        onRetry={vi.fn()}
      />,
    );

    const list = screen.getByRole("list", {
      name: "Usuarios con más ideas aprobadas",
    });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveClass("is-first");
    expect(within(rows[0]!).getByText("@laura_critica")).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent("18 aprobadas");
    expect(within(rows[1]!).getByText("@pablo_sin_pitch")).toBeInTheDocument();
  });

  it("shows empty, loading and retryable error states", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <BestUsers state={{ status: "loading" }} onRetry={onRetry} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/cargando/i);

    rerender(<BestUsers state={{ status: "empty" }} onRetry={onRetry} />);
    expect(
      screen.getByText(/aún no hay humanos notables/i),
    ).toBeInTheDocument();

    rerender(<BestUsers state={{ status: "error" }} onRetry={onRetry} />);
    screen.getByRole("button", { name: "Volver a intentarlo" }).click();
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("never renders more than ten entries", () => {
    const users = Array.from({ length: 12 }, (_, index) => ({
      username: `user-${index + 1}`,
      approvedIdeasCount: 12 - index,
    }));
    render(
      <BestUsers state={{ status: "success", users }} onRetry={vi.fn()} />,
    );

    const list = screen.getByRole("list", {
      name: "Usuarios con más ideas aprobadas",
    });
    expect(within(list).getAllByRole("listitem")).toHaveLength(10);
    expect(within(list).queryByText("@user-11")).not.toBeInTheDocument();
  });
});
