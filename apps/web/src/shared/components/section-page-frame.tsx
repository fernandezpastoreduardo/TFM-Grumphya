import { type ReactNode, type Ref, useRef } from "react";
import { createPortal } from "react-dom";
import "./mobile-navigation.scss";
import "./section-page-frame.scss";
import "./shared-components.scss";
import { AccountActions } from "./account-actions";
import { usePersistentTheme } from "../hooks/use-persistent-theme";
import { useMobileMenu } from "../hooks/use-mobile-menu";
import { useSessionStatus } from "../../infrastructure/auth/use-session-status";
import { AccreditationSeal } from "./accreditation-seal";
import { useNavigationOverflow } from "../hooks/use-navigation-overflow";

export type SectionPageMeta = {
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
    | "contact"
    | "profile"
    | "admin"
    | "register";
};

const SECTION_LINKS = [
  { path: "/lo-peor-de-lo-peor", label: "Peores ideas" },
  { path: "/descargate", label: "Descárgate" },
  { path: "/humanos-notables", label: "Humanos notables" },
  { path: "/buenas-practicas", label: "Buenas prácticas" },
  { path: "/precios", label: "Planes" },
  { path: "/contacto", label: "Contacto" },
] as const;
const ADMIN_SECTION_LINK = {
  path: "/panel-control",
  label: "Panel de control",
} as const;

function getSectionLinks(isAdmin: boolean) {
  return isAdmin ? [...SECTION_LINKS, ADMIN_SECTION_LINK] : SECTION_LINKS;
}

function SectionHeader({
  headerRef,
  navigationRef,
  hasNavigationOverflow,
  currentPath,
  theme,
  onThemeToggle,
  isMenuOpen,
  onMenuToggle,
  menuTriggerRef,
  isAuthenticated,
  isAdmin,
  isSigningOut,
  avatarUrl,
  onSignOut,
}: {
  headerRef: Ref<HTMLElement>;
  navigationRef: Ref<HTMLElement>;
  hasNavigationOverflow: boolean;
  currentPath: string;
  theme: "light" | "dark";
  onThemeToggle: () => void;
  isMenuOpen: boolean;
  onMenuToggle: () => void;
  menuTriggerRef: Ref<HTMLButtonElement>;
  isAuthenticated: boolean | null;
  isAdmin: boolean;
  isSigningOut: boolean;
  avatarUrl: string | null;
  onSignOut: () => void;
}) {
  return (
    <header
      ref={headerRef}
      className={`site-header${hasNavigationOverflow ? " navigation-overflow" : ""}`}
    >
      <a className="site-brand" href="/" aria-label="Grumphya, inicio">
        <span className="brand-mark" aria-hidden="true" />
        <span>Grumphya</span>
      </a>
      <nav
        ref={navigationRef}
        className="site-nav"
        aria-label="Navegación principal"
      >
        <a href="/" className="site-nav-home">
          Inicio
        </a>
        {getSectionLinks(isAdmin).map((item) => (
          <a
            href={item.path}
            key={item.path}
            aria-current={item.path === currentPath ? "page" : undefined}
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
          <span className="theme-switch-thumb" />
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
        <h1>
          <span className="section-hero-title-mark">{page.title}</span>
        </h1>
        <p>{page.intro}</p>
      </div>
      <SectionHeroMascot mascotClass={mascotClass} />
    </section>
  );
}

function SectionHeroMascot({
  mascotClass,
  mobile = false,
}: {
  mascotClass: string;
  mobile?: boolean;
}) {
  return (
    <div
      className={`${mobile ? "section-mobile-mascot" : "section-hero-mascot"}${mascotClass}`}
      role="img"
      aria-label="Grumphya, la criatura que examina las ideas"
    />
  );
}

export function SectionPageFrame({
  page,
  currentPath = typeof window === "undefined" ? "/" : window.location.pathname,
  children,
  showHero = true,
}: {
  page: SectionPageMeta;
  currentPath?: string;
  children: ReactNode;
  showHero?: boolean;
}) {
  const { theme, toggleTheme } = usePersistentTheme(currentPath === "/precios");
  const {
    isOpen: isMenuOpen,
    toggle: toggleMenu,
    close: closeMenu,
    triggerRef: menuTriggerRef,
    menuRef,
  } = useMobileMenu();
  const headerRef = useRef<HTMLElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const hasNavigationOverflow = useNavigationOverflow(headerRef, navigationRef);
  const session = useSessionStatus();
  const isAdmin = session.accountAttempts?.isAdmin === true;
  return (
    <div className={`app-page theme-${theme}${isMenuOpen ? " menu-open" : ""}`}>
      <div className="app-frame">
        <SectionHeader
          headerRef={headerRef}
          navigationRef={navigationRef}
          hasNavigationOverflow={hasNavigationOverflow}
          currentPath={currentPath}
          theme={theme}
          onThemeToggle={toggleTheme}
          isMenuOpen={isMenuOpen}
          onMenuToggle={toggleMenu}
          menuTriggerRef={menuTriggerRef}
          isAuthenticated={session.isAuthenticated}
          isAdmin={isAdmin}
          avatarUrl={session.avatarUrl}
          isSigningOut={session.isSigningOut}
          onSignOut={() => void session.signOut()}
        />
        <main className="section-main">
          {showHero ? <SectionHero page={page} /> : null}
          {children}
          {showHero && page.mascot ? (
            <SectionHeroMascot mascotClass={` mascot-${page.mascot}`} mobile />
          ) : null}
        </main>
        <footer className="site-footer">
          <a className="site-brand" href="/">
            Grumphya
          </a>
          <span>Será por malas ideas.</span>
          <AccreditationSeal />
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
                className={`site-mobile-menu mobile-menu-portal theme-${theme}${hasNavigationOverflow ? " navigation-overflow" : ""}`}
                role="dialog"
                aria-modal="true"
                aria-label="Menú de navegación"
              >
                <nav id="site-sections-menu" aria-label="Secciones principales">
                  <a
                    href="/"
                    aria-current={currentPath === "/" ? "page" : undefined}
                  >
                    Inicio
                  </a>
                  {getSectionLinks(isAdmin).map((item) => (
                    <a
                      href={item.path}
                      key={item.path}
                      aria-current={
                        item.path === currentPath ? "page" : undefined
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
