import type { Theme } from "../hooks/use-persistent-theme";

type SiteThemeToggleProps = {
  theme: Theme;
  variant: "home" | "section";
  onToggle: () => void;
};

const THEME_LABEL = {
  LIGHT: "Activar modo oscuro",
  DARK: "Activar modo claro",
} as const;

export function SiteThemeToggle({
  theme,
  variant,
  onToggle,
}: SiteThemeToggleProps) {
  return (
    <button
      className={variant === "home" ? "theme-toggle" : "site-theme-toggle"}
      type="button"
      role="switch"
      aria-label={theme === "light" ? THEME_LABEL.LIGHT : THEME_LABEL.DARK}
      aria-checked={theme === "dark"}
      onClick={onToggle}
    >
      <span className="theme-switch-sun" aria-hidden="true">
        ☀
      </span>
      <span className="theme-switch-track" aria-hidden="true">
        <span className="theme-switch-thumb" />
      </span>
      <span className="theme-switch-moon" aria-hidden="true">
        ☾
      </span>
    </button>
  );
}
