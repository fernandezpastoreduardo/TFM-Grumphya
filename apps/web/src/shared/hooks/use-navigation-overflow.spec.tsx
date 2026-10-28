import { act, renderHook, waitFor } from "@testing-library/react";
import type { RefObject } from "react";
import { describe, expect, it } from "vitest";
import { useNavigationOverflow } from "./use-navigation-overflow";

function setDimensions(
  element: HTMLElement,
  clientWidth: number,
  scrollWidth: number,
) {
  Object.defineProperties(element, {
    clientWidth: { configurable: true, value: clientWidth },
    scrollWidth: { configurable: true, value: scrollWidth },
  });
}

describe("useNavigationOverflow", () => {
  it("switches to compact navigation when items stop fitting and expands again when they fit", () => {
    const container = document.createElement("header");
    const navigation = document.createElement("nav");
    container.append(navigation);
    setDimensions(container, 800, 800);
    setDimensions(navigation, 500, 500);
    const containerRef = {
      current: container,
    } as RefObject<HTMLElement | null>;
    const navigationRef = {
      current: navigation,
    } as RefObject<HTMLElement | null>;

    const { result } = renderHook(() =>
      useNavigationOverflow(containerRef, navigationRef),
    );

    expect(result.current).toBe(false);

    setDimensions(navigation, 420, 820);
    act(() => window.dispatchEvent(new Event("resize")));
    expect(result.current).toBe(true);

    setDimensions(navigation, 520, 700);
    act(() => window.dispatchEvent(new Event("resize")));
    expect(result.current).toBe(false);
  });

  it("recalculates when navigation labels change", async () => {
    const container = document.createElement("header");
    const navigation = document.createElement("nav");
    const link = document.createElement("a");
    link.textContent = "Planes";
    navigation.append(link);
    container.append(navigation);
    setDimensions(container, 600, 600);
    setDimensions(navigation, 500, 500);
    const containerRef = {
      current: container,
    } as RefObject<HTMLElement | null>;
    const navigationRef = {
      current: navigation,
    } as RefObject<HTMLElement | null>;

    const { result } = renderHook(() =>
      useNavigationOverflow(containerRef, navigationRef),
    );

    expect(result.current).toBe(false);

    act(() => {
      link.textContent = "Planes con condiciones y servicios adicionales";
      setDimensions(navigation, 500, 700);
    });

    await waitFor(() => expect(result.current).toBe(true));
  });

  it("recalculates when browser zoom reduces the available layout width", () => {
    const container = document.createElement("header");
    const navigation = document.createElement("nav");
    container.append(navigation);
    setDimensions(container, 900, 900);
    setDimensions(navigation, 700, 700);
    const containerRef = {
      current: container,
    } as RefObject<HTMLElement | null>;
    const navigationRef = {
      current: navigation,
    } as RefObject<HTMLElement | null>;

    const { result } = renderHook(() =>
      useNavigationOverflow(containerRef, navigationRef),
    );

    expect(result.current).toBe(false);

    setDimensions(container, 600, 900);
    act(() => window.dispatchEvent(new Event("resize")));

    expect(result.current).toBe(true);
  });
});
