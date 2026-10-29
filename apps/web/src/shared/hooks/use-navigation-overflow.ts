import { useEffect, useState, type RefObject } from "react";

const NAVIGATION_OVERFLOW_TOLERANCE_PX = 1;

function getCssWidth(value: string) {
  const width = Number.parseFloat(value);
  return Number.isFinite(width) ? width : 0;
}

function getRequiredHeaderWidth(
  container: HTMLElement,
  navigation: HTMLElement,
) {
  const mobileMenu = container.querySelector(
    ".mobile-menu-trigger",
  )?.parentElement;
  const navigationGap = getCssWidth(
    window.getComputedStyle(navigation).columnGap,
  );
  const intrinsicNavigationWidth =
    Array.from(navigation.children).reduce(
      (totalWidth, item) => totalWidth + item.getBoundingClientRect().width,
      0,
    ) +
    navigationGap * Math.max(navigation.children.length - 1, 0);
  const projectedHeaderChildren = Array.from(container.children).filter(
    (child) => child !== mobileMenu,
  );
  const containerGap = getCssWidth(
    window.getComputedStyle(container).columnGap,
  );
  const siblingWidth = projectedHeaderChildren
    .filter((child) => child !== navigation)
    .reduce(
      (totalWidth, child) => totalWidth + child.getBoundingClientRect().width,
      0,
    );
  const headerGaps =
    containerGap * Math.max(projectedHeaderChildren.length - 1, 0);

  return intrinsicNavigationWidth + siblingWidth + headerGaps;
}

export function useNavigationOverflow(
  containerRef: RefObject<HTMLElement | null>,
  navigationRef: RefObject<HTMLElement | null>,
) {
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const navigation = navigationRef.current;
    if (!container || !navigation) return;

    let isActive = true;
    const measureOverflow = () => {
      if (!isActive) return;
      if (window.getComputedStyle(navigation).display === "none") {
        setHasOverflow(false);
        return;
      }
      const nextHasOverflow =
        getRequiredHeaderWidth(container, navigation) >
        container.clientWidth + NAVIGATION_OVERFLOW_TOLERANCE_PX;
      setHasOverflow((currentHasOverflow) =>
        currentHasOverflow === nextHasOverflow
          ? currentHasOverflow
          : nextHasOverflow,
      );
    };

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measureOverflow);
    resizeObserver?.observe(container);
    resizeObserver?.observe(navigation);
    const mutationObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(measureOverflow);
    mutationObserver?.observe(navigation, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    window.addEventListener("resize", measureOverflow);
    void document.fonts?.ready.then(measureOverflow);
    measureOverflow();

    return () => {
      isActive = false;
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("resize", measureOverflow);
    };
  }, [containerRef, navigationRef]);

  return hasOverflow;
}
