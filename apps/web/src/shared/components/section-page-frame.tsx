import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./mobile-navigation.scss";
import "./section-page-frame.scss";
import "./shared-components.scss";
import { AccountActions } from "./account-actions";
import { usePersistentTheme } from "../hooks/use-persistent-theme";
import { useSessionStatus } from "../../infrastructure/auth/use-session-status";

export type SectionPageMeta = {
  label: string;
  title: string;
  intro: string;
  theme: "rose" | "blue" | "mint" | "calm";
  mascot?: "judge" | "pointing";
};

const SECTION_LINKS = [
  { path: "/lo-peor-de-lo-peor", label: "Peores ideas" },
  { path: "/descargate", label: "Descárgate" },
  { path: "/humanos-notables", label: "Humanos notables" },
  { path: "/buenas-practicas", label: "Buenas prácticas" },
  { path: "/precios", label: "Planes" },
  { path: "/contacto", label: "Contacto" },
] as const;

function SectionHeader({
  theme,
  onThemeToggle,
  isMenuOpen,
  onMenuToggle,
  isAuthenticated,
  isSigningOut,
  onSignOut,
}: {
  theme: "light" | "dark";
  onThemeToggle: () => void;
  isMenuOpen: boolean;
  onMenuToggle: () => void;
  isAuthenticated: boolean | null;
  isSigningOut: boolean;
  onSignOut: () => void;
}) {
  return (
    <header className="site-header">
      <a className="site-brand" href="/" aria-label="Grumphya, inicio">
        <span className="brand-mark" aria-hidden="true" />
        <span>Grumphya</span>
      </a>
      <nav className="site-nav" aria-label="Navegación principal">
        <a href="/" className="site-nav-home">
          Inicio
        </a>
        {SECTION_LINKS.map((item) => (
          <a
            href={item.path}
            key={item.path}
            aria-current={
              item.path === window.location.pathname ? "page" : undefined
            }
          >
            {item.label}
          </a>
        ))}
      </nav>
      <AccountActions
        isAuthenticated={isAuthenticated}
        isSigningOut={isSigningOut}
        onSignOut={onSignOut}
        variant="site"
      />
      <button
        className="site-theme-toggle"
        type="button"
        role="switch"
        aria-label={
          theme === "light" ? "Activar modo oscuro" : "Activar modo claro"
        }
        aria-checked={theme === "dark"}
        onClick={onThemeToggle}
      >
        <span className="theme-switch-sun" aria-hidden="true">
          ☀
        </span>
        <span className="theme-switch-track" aria-hidden="true">
          <span className="theme-switch-thumb">
            {theme === "light" ? "☀" : "☾"}
          </span>
        </span>
        <span className="theme-switch-moon" aria-hidden="true">
          ☾
        </span>
      </button>
      <div className="site-mobile-menu">
        <button
          className="mobile-menu-trigger"
          type="button"
          aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú de secciones"}
          aria-expanded={isMenuOpen}
          aria-controls="site-sections-menu"
          onClick={onMenuToggle}
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
      </div>
    </header>
  );
}

function SectionHero({ page }: { page: SectionPageMeta }) {
  return (
    <section className={`section-hero section-hero-${page.theme}`}>
      <div className="section-hero-copy">
        <span className="section-kicker">
          <span className="kicker-dot" />
          {page.label}
        </span>
        <h1>
          <span className="section-hero-title-mark">{page.title}</span>
        </h1>
        <p>{page.intro}</p>
      </div>
      <div
        className={`section-hero-mascot${page.mascot === "pointing" ? " mascot-pointing" : ""}`}
        role="img"
        aria-label="Grumphya, la criatura que examina las ideas"
      />
      <span className="hero-scribble" aria-hidden="true">
        ¿en serio?
      </span>
    </section>
  );
}

export function SectionPageFrame({
  page,
  children,
}: {
  page: SectionPageMeta;
  children: ReactNode;
}) {
  const { theme, toggleTheme } = usePersistentTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const session = useSessionStatus();
  return (
    <div className={`app-page theme-${theme}${isMenuOpen ? " menu-open" : ""}`}>
      <div className="app-frame">
        <SectionHeader
          theme={theme}
          onThemeToggle={toggleTheme}
          isMenuOpen={isMenuOpen}
          onMenuToggle={() => setIsMenuOpen((open) => !open)}
          isAuthenticated={session.isAuthenticated}
          isSigningOut={session.isSigningOut}
          onSignOut={() => void session.signOut()}
        />
        <main className="section-main">
          <SectionHero page={page} />
          {children}
        </main>
        <footer className="site-footer">
          <a className="site-brand" href="/">
            Grumphya
          </a>
          <span>Será por malas ideas.</span>
          <a href="/">
            Evaluar otra idea <span aria-hidden="true">↗</span>
          </a>
        </footer>
      </div>
      {isMenuOpen
        ? createPortal(
            <>
              <button
                className="mobile-menu-backdrop"
                type="button"
                aria-label="Cerrar menú"
                onClick={() => setIsMenuOpen(false)}
              />
              <div className="site-mobile-menu mobile-menu-portal">
                <nav id="site-sections-menu" aria-label="Secciones principales">
                  <a
                    href="/"
                    aria-current={
                      window.location.pathname === "/" ? "page" : undefined
                    }
                  >
                    Inicio
                  </a>
                  {SECTION_LINKS.map((item) => (
                    <a
                      href={item.path}
                      key={item.path}
                      aria-current={
                        item.path === window.location.pathname
                          ? "page"
                          : undefined
                      }
                    >
                      {item.label}
                    </a>
                  ))}
                  <AccountActions
                    isAuthenticated={session.isAuthenticated}
                    isSigningOut={session.isSigningOut}
                    onSignOut={() => void session.signOut()}
                    variant="site"
                  />
                </nav>
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
