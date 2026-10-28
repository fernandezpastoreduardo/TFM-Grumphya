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
  const navigationGap = getCssWidth(
    window.getComputedStyle(navigation).columnGap,
  );
  const navigationItemsWidth = Array.from(navigation.children).reduce(
    (totalWidth, item) => totalWidth + item.getBoundingClientRect().width,
    0,
  );
  const intrinsicNavigationWidth = Math.max(
    navigation.scrollWidth,
    navigationItemsWidth +
      navigationGap * Math.max(navigation.children.length - 1, 0),
  );
  const trigger = container.querySelector<HTMLElement>(".mobile-menu-trigger");
  const triggerWidth = trigger
    ? getCssWidth(window.getComputedStyle(trigger).width)
    : 0;
  const triggerParent = trigger?.parentElement;
  const triggerParentGap = triggerParent
    ? getCssWidth(window.getComputedStyle(triggerParent).columnGap)
    : 0;
  const containerGap = getCssWidth(
    window.getComputedStyle(container).columnGap,
  );
  const siblingWidth = Array.from(container.children)
    .filter((child) => child !== navigation)
    .reduce((totalWidth, child) => {
      const childWidth = child.getBoundingClientRect().width;
      const includesTrigger = trigger && child.contains(trigger);
      return totalWidth + childWidth - (includesTrigger ? triggerWidth : 0);
    }, 0);
  const headerGaps = containerGap * Math.max(container.children.length - 1, 0);

  return (
    intrinsicNavigationWidth +
    siblingWidth +
    headerGaps +
    triggerWidth +
    Math.max(triggerParentGap, containerGap)
  );
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
