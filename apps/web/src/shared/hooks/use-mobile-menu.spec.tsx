import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useMobileMenu } from "./use-mobile-menu";

const MENU_CONTENT = `
  <a href="/first">Primera opción</a>
  <button type="button">Última opción</button>
`;

describe("useMobileMenu", () => {
  it("starts closed and toggles its state", () => {
    const { result } = renderHook(() => useMobileMenu());

    expect(result.current.isOpen).toBe(false);

    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(true);

    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(false);
  });

  it("focuses the first menu item when opened and restores the trigger on close", () => {
    const { result } = renderHook(() => useMobileMenu());
    const trigger = document.createElement("button");
    const menu = document.createElement("div");
    menu.innerHTML = MENU_CONTENT;
    document.body.append(trigger, menu);
    result.current.triggerRef.current = trigger;
    result.current.menuRef.current = menu;

    act(() => result.current.toggle());

    expect(menu.querySelector("a")).toHaveFocus();

    act(() => result.current.close());

    expect(trigger).toHaveFocus();
    expect(result.current.isOpen).toBe(false);
    trigger.remove();
    menu.remove();
  });

  it("closes on Escape and restores focus to the trigger", () => {
    const { result } = renderHook(() => useMobileMenu());
    const trigger = document.createElement("button");
    const menu = document.createElement("div");
    menu.innerHTML = MENU_CONTENT;
    document.body.append(trigger, menu);
    result.current.triggerRef.current = trigger;
    result.current.menuRef.current = menu;
    act(() => result.current.toggle());
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true,
    });

    act(() => document.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(true);
    expect(result.current.isOpen).toBe(false);
    expect(trigger).toHaveFocus();
    trigger.remove();
    menu.remove();
  });

  it("wraps Tab focus in both directions at the menu boundaries", () => {
    const { result } = renderHook(() => useMobileMenu());
    const trigger = document.createElement("button");
    const menu = document.createElement("div");
    menu.innerHTML = MENU_CONTENT;
    document.body.append(trigger, menu);
    result.current.triggerRef.current = trigger;
    result.current.menuRef.current = menu;
    const items = menu.querySelectorAll<HTMLElement>("a, button");
    act(() => result.current.toggle());

    items[1].focus();
    const forwardTab = new KeyboardEvent("keydown", {
      key: "Tab",
      cancelable: true,
    });
    act(() => document.dispatchEvent(forwardTab));

    expect(forwardTab.defaultPrevented).toBe(true);
    expect(items[0]).toHaveFocus();

    const backwardTab = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      cancelable: true,
    });
    act(() => document.dispatchEvent(backwardTab));

    expect(backwardTab.defaultPrevented).toBe(true);
    expect(items[1]).toHaveFocus();
    act(() => result.current.close());
    trigger.remove();
    menu.remove();
  });

  it("leaves Tab alone away from a boundary and tolerates a menu without focusable items", () => {
    const { result } = renderHook(() => useMobileMenu());
    const trigger = document.createElement("button");
    const menu = document.createElement("div");
    menu.innerHTML = MENU_CONTENT;
    document.body.append(trigger, menu);
    result.current.triggerRef.current = trigger;
    result.current.menuRef.current = menu;
    const items = menu.querySelectorAll<HTMLElement>("a, button");
    act(() => result.current.toggle());
    items[0].focus();
    const tab = new KeyboardEvent("keydown", {
      key: "Tab",
      cancelable: true,
    });
    act(() => document.dispatchEvent(tab));
    expect(tab.defaultPrevented).toBe(false);

    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      cancelable: true,
    });
    act(() => document.dispatchEvent(enter));
    expect(enter.defaultPrevented).toBe(false);

    menu.replaceChildren(document.createElement("span"));
    const emptyMenuTab = new KeyboardEvent("keydown", {
      key: "Tab",
      cancelable: true,
    });
    act(() => document.dispatchEvent(emptyMenuTab));
    expect(emptyMenuTab.defaultPrevented).toBe(false);

    act(() => result.current.close());
    trigger.remove();
    menu.remove();
  });
});
