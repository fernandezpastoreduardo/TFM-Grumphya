import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UsageLimitDialog } from "./usage-limit-dialog";

describe("UsageLimitDialog", () => {
  it("uses the optimized crossed-arms mascot as a decorative image", () => {
    render(<UsageLimitDialog open scope="ideas" onClose={() => undefined} />);

    expect(screen.getByRole("dialog").querySelector("img")).toHaveAttribute(
      "src",
      "/assets/grumphya/mascot-crossed-arms.webp",
    );
    expect(screen.getByRole("dialog").querySelector("img")).toHaveAttribute(
      "alt",
      "",
    );
  });
});
