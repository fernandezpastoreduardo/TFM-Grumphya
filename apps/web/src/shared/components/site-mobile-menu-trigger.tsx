import type { Ref } from "react";

type SiteMobileMenuTriggerProps = {
  isOpen: boolean;
  menuId: string;
  triggerRef: Ref<HTMLButtonElement>;
  onToggle: () => void;
};

export function SiteMobileMenuTrigger({
  isOpen,
  menuId,
  triggerRef,
  onToggle,
}: SiteMobileMenuTriggerProps) {
  return (
    <button
      ref={triggerRef}
      className="mobile-menu-trigger"
      type="button"
      aria-label={isOpen ? "Cerrar menú" : "Abrir menú de secciones"}
      aria-expanded={isOpen}
      aria-controls={menuId}
      onClick={onToggle}
    >
      <span className="menu-icon-open" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M4 6.5h16M4 12h16M4 17.5h16" />
        </svg>
      </span>
      <span className="menu-icon-close" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </span>
    </button>
  );
}
