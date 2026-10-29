import { act, renderHook, waitFor } from "@testing-library/react";
import type { RefObject } from "react";
import { describe, expect, it, vi } from "vitest";
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

function setRenderedWidth(element: HTMLElement, width: number) {
  element.getBoundingClientRect = () =>
    ({
      width,
      height: 34,
      top: 0,
      right: width,
      bottom: 34,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

function createHeaderLayout() {
  const container = document.createElement("header");
  const brand = document.createElement("a");
  const navigation = document.createElement("nav");
  const firstLink = document.createElement("a");
  const secondLink = document.createElement("a");
  const accountActions = document.createElement("div");
  const themeToggle = document.createElement("button");
  const mobileMenu = document.createElement("div");
  const menuTrigger = document.createElement("button");

  firstLink.textContent = "Inicio";
  secondLink.textContent = "Peores ideas";
  container.style.columnGap = "12px";
  navigation.style.columnGap = "10px";
  navigation.append(firstLink, secondLink);
  mobileMenu.className = "site-mobile-menu";
  menuTrigger.className = "mobile-menu-trigger";
  mobileMenu.append(menuTrigger);
  container.append(brand, navigation, accountActions, themeToggle, mobileMenu);

  setRenderedWidth(brand, 200);
  setRenderedWidth(firstLink, 100);
  setRenderedWidth(secondLink, 100);
  setRenderedWidth(accountActions, 100);
  setRenderedWidth(themeToggle, 50);
  setRenderedWidth(menuTrigger, 42);
  Object.defineProperties(navigation, {
    scrollWidth: { configurable: true, value: 500 },
  });
  Object.defineProperty(container, "clientWidth", {
    configurable: true,
    value: 600,
  });

  return { container, navigation };
}

describe("useNavigationOverflow", () => {
  it("measures natural link widths without counting the hidden menu or stretched nav track", () => {
    const { container, navigation } = createHeaderLayout();
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

    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 580,
    });
    act(() => window.dispatchEvent(new Event("resize")));
    expect(result.current).toBe(true);

    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 600,
    });
    act(() => window.dispatchEvent(new Event("resize")));
    expect(result.current).toBe(false);
  });

  it("recalculates when navigation labels change", async () => {
    const container = document.createElement("header");
    const navigation = document.createElement("nav");
    const link = document.createElement("a");
    link.textContent = "Planes";
    navigation.style.columnGap = "10px";
    navigation.append(link);
    container.append(navigation);
    setDimensions(container, 600, 600);
    setDimensions(navigation, 500, 500);
    setRenderedWidth(link, 400);
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
      setRenderedWidth(link, 700);
    });

    await waitFor(() => expect(result.current).toBe(true));
  });

  it("recalculates when browser zoom reduces the available layout width", () => {
    const { container, navigation } = createHeaderLayout();
    setDimensions(navigation, 700, 700);
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 900,
    });
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

    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 550,
    });
    act(() => window.dispatchEvent(new Event("resize")));

    expect(result.current).toBe(true);
  });

  it("leaves the mobile navigation state to its responsive styles", () => {
    const { container, navigation } = createHeaderLayout();
    Object.defineProperty(container, "clientWidth", {
      configurable: true,
      value: 550,
    });
    const containerRef = {
      current: container,
    } as RefObject<HTMLElement | null>;
    const navigationRef = {
      current: navigation,
    } as RefObject<HTMLElement | null>;

    const { result } = renderHook(() =>
      useNavigationOverflow(containerRef, navigationRef),
    );

    expect(result.current).toBe(true);

    vi.spyOn(window, "getComputedStyle").mockImplementation(
      (element) =>
        ({
          display: element === navigation ? "none" : "flex",
        }) as CSSStyleDeclaration,
    );
    act(() => window.dispatchEvent(new Event("resize")));

    expect(result.current).toBe(false);
  });
});
