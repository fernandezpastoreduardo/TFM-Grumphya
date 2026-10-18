import { type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import "./mobile-navigation.scss";
import "./section-page-frame.scss";
import "./shared-components.scss";
import { AccountActions } from "./account-actions";
import { usePersistentTheme } from "../hooks/use-persistent-theme";
import { useMobileMenu } from "../hooks/use-mobile-menu";
import { useSessionStatus } from "../../infrastructure/auth/use-session-status";

export type SectionPageMeta = {
  label: string;
  title: string;
  intro: string;
  theme: "rose" | "blue" | "mint" | "calm";
  mascot?:
    | "judge"
    | "pointing"
    | "plans"
    | "good-practices"
    | "roast"
    | "worst-ideas"
    | "login"
    | "notable-humans"
    | "contact";
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
  menuTriggerRef,
  isAuthenticated,
  isSigningOut,
  avatarUrl,
  onSignOut,
}: {
  theme: "light" | "dark";
  onThemeToggle: () => void;
  isMenuOpen: boolean;
  onMenuToggle: () => void;
  menuTriggerRef: Ref<HTMLButtonElement>;
  isAuthenticated: boolean | null;
  isSigningOut: boolean;
  avatarUrl: string | null;
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
        avatarUrl={avatarUrl}
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
          ref={menuTriggerRef}
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
  const mascotClass = page.mascot ? ` mascot-${page.mascot}` : "";
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
        className={`section-hero-mascot${mascotClass}`}
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
  showHero = true,
}: {
  page: SectionPageMeta;
  children: ReactNode;
  showHero?: boolean;
}) {
  const { theme, toggleTheme } = usePersistentTheme();
  const {
    isOpen: isMenuOpen,
    toggle: toggleMenu,
    close: closeMenu,
    triggerRef: menuTriggerRef,
    menuRef,
  } = useMobileMenu();
  const session = useSessionStatus();
  return (
    <div className={`app-page theme-${theme}${isMenuOpen ? " menu-open" : ""}`}>
      <div className="app-frame">
        <SectionHeader
          theme={theme}
          onThemeToggle={toggleTheme}
          isMenuOpen={isMenuOpen}
          onMenuToggle={toggleMenu}
          menuTriggerRef={menuTriggerRef}
          isAuthenticated={session.isAuthenticated}
          avatarUrl={session.avatarUrl}
          isSigningOut={session.isSigningOut}
          onSignOut={() => void session.signOut()}
        />
        <main className="section-main">
          {showHero ? <SectionHero page={page} /> : null}
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
                aria-hidden="true"
                tabIndex={-1}
                onClick={closeMenu}
              />
              <div
                ref={menuRef}
                className={`site-mobile-menu mobile-menu-portal theme-${theme}`}
                role="dialog"
                aria-modal="true"
                aria-label="Menú de navegación"
              >
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
                    avatarUrl={session.avatarUrl}
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
