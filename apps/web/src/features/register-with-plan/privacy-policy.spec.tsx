import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrivacyPolicy } from "./privacy-policy";

describe("PrivacyPolicy", () => {
  it("clearly presents a provisional privacy policy page", () => {
    render(<PrivacyPolicy />);

    expect(
      screen.getByRole("heading", { name: /política de privacidad/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/versión provisional/i)).toBeInTheDocument();
  });
});
