import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoadingSkeleton, SkeletonBlock } from "./loading-skeleton";

const LOADING_LABEL = "Preparando esta sección";
const VISIBILITY_DELAY_MS = 200;

describe("LoadingSkeleton", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps skeleton details hidden during brief loads and reveals them accessibly after the delay", () => {
    vi.useFakeTimers();
    render(
      <LoadingSkeleton label={LOADING_LABEL}>
        <SkeletonBlock className="skeleton-section-heading" />
      </LoadingSkeleton>,
    );

    const loadingStatus = screen.getByRole("status", { name: LOADING_LABEL });
    expect(loadingStatus).toHaveAttribute("aria-busy", "true");
    expect(loadingStatus).toHaveTextContent(LOADING_LABEL);
    expect(
      document.querySelector(".loading-skeleton-content"),
    ).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(VISIBILITY_DELAY_MS - 1);
    });
    expect(
      document.querySelector(".loading-skeleton-content"),
    ).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(document.querySelector(".loading-skeleton-content")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(
      document.querySelector(".skeleton-section-heading"),
    ).toBeInTheDocument();
  });

  it("can render its skeleton content immediately to reserve server-rendered space", () => {
    render(
      <LoadingSkeleton label={LOADING_LABEL} showImmediately>
        <SkeletonBlock className="skeleton-section-heading" />
      </LoadingSkeleton>,
    );

    expect(document.querySelector(".loading-skeleton-content")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(
      document.querySelector(".skeleton-section-heading"),
    ).toBeInTheDocument();
  });
});
