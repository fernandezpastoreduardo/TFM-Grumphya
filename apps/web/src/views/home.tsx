import { useRef } from "react";
import { createPortal } from "react-dom";
import "./home.scss";
import "../shared/components/mobile-navigation.scss";
import "../shared/components/shared-components.scss";
import { useAnonymousUsage } from "../shared/hooks/use-anonymous-usage";
import { ErrorPages } from "../features/error-pages/error-pages";
import { usePersistentTheme } from "../shared/hooks/use-persistent-theme";
import { useMobileMenu } from "../shared/hooks/use-mobile-menu";
import { useNavigationOverflow } from "../shared/hooks/use-navigation-overflow";
import { useSessionStatus } from "../infrastructure/auth/use-session-status";
import { AccountActions } from "../shared/components/account-actions";
import { AccreditationSeal } from "../shared/components/accreditation-seal";
import { IdeaEvaluation } from "../features/idea-evaluation/idea-evaluation";

const THEME_LABEL = {
  LIGHT: "Activar modo oscuro",
  DARK: "Activar modo claro",
} as const;
const NAV_SECTIONS = [
  { path: "/lo-peor-de-lo-peor", label: "Peores ideas" },
  { path: "/descargate", label: "Descárgate" },
  { path: "/humanos-notables", label: "Humanos notables" },
  { path: "/buenas-practicas", label: "Buenas prácticas" },
  { path: "/precios", label: "Planes" },
  { path: "/contacto", label: "Contacto" },
] as const;
const ADMIN_NAV_SECTION = {
  path: "/panel-control",
  label: "Panel de control",
} as const;

function getHomeNavSections(isAdmin: boolean) {
  return isAdmin ? [...NAV_SECTIONS, ADMIN_NAV_SECTION] : NAV_SECTIONS;
}
type HeroRayPlacement =
  | "hero-rays-copy-start"
  | "hero-rays-copy-end"
  | "hero-rays-stage-start"
  | "hero-rays-stage-end";
const HERO_RAY_MARKS = ["short", "middle", "long"] as const;
function HeroRayCluster({ placement }: { placement: HeroRayPlacement }) {
  return (
    <span className={`hero-ray-cluster ${placement}`} aria-hidden="true">
      {HERO_RAY_MARKS.map((mark) => (
        <span className={`hero-ray hero-ray-${mark}`} key={mark} />
      ))}
    </span>
  );
}

export function Home() {
  const homeTopbarRef = useRef<HTMLElement>(null);
  const homeNavigationRef = useRef<HTMLElement>(null);
  const hasNavigationOverflow = useNavigationOverflow(
    homeTopbarRef,
    homeNavigationRef,
  );
  const { theme, toggleTheme } = usePersistentTheme();
  const {
    isOpen: isMobileMenuOpen,
    toggle: toggleMobileMenu,
    close: closeMobileMenu,
    triggerRef: mobileMenuTriggerRef,
    menuRef: mobileMenuRef,
  } = useMobileMenu();
  const anonymousUsage = useAnonymousUsage();
  const session = useSessionStatus();
  const isAdmin = session.accountAttempts?.isAdmin === true;

  if (anonymousUsage.errorStatus === 429) {
    return <ErrorPages status="429" detail={anonymousUsage.error} />;
  }

  return (
    <div
      className={`home-page theme-${theme}${isMobileMenuOpen ? " menu-open" : ""}`}
    >
      <main className="home-shell">
        <header
          ref={homeTopbarRef}
          className={`home-topbar${hasNavigationOverflow ? " navigation-overflow" : ""}`}
        >
          <a className="home-brand" href="/" aria-label="Grumphya, inicio">
            Grumphya
          </a>
          <nav
            ref={homeNavigationRef}
            className="home-nav-links"
            aria-label="Secciones principales"
          >
            <a
              className="home-nav-link is-current"
              href="/"
              aria-current="page"
            >
              Inicio
            </a>
            {getHomeNavSections(isAdmin).map((section) => (
              <a
                className="home-nav-link"
                key={section.path}
                href={section.path}
              >
                {section.label}
              </a>
            ))}
          </nav>
          <div className="home-nav-actions">
            <AccountActions
              isAuthenticated={session.isAuthenticated}
              avatarUrl={session.avatarUrl}
              isSigningOut={session.isSigningOut}
              onSignOut={() => void session.signOut()}
              variant="home"
            />
            <button
              className="theme-toggle"
              type="button"
              role="switch"
              aria-label={
                theme === "light" ? THEME_LABEL.LIGHT : THEME_LABEL.DARK
              }
              aria-checked={theme === "dark"}
              onClick={toggleTheme}
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
            <div className="home-mobile-menu">
              <button
                ref={mobileMenuTriggerRef}
                className="mobile-menu-trigger"
                type="button"
                aria-label={
                  isMobileMenuOpen ? "Cerrar menú" : "Abrir menú de secciones"
                }
                aria-expanded={isMobileMenuOpen}
                aria-controls="home-sections-menu"
                onClick={toggleMobileMenu}
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
          </div>
        </header>

        <IdeaEvaluation session={session} anonymousUsage={anonymousUsage}>
          {({ workspace, feedback }) => (
            <>
              <div className="home-hero-layout">
                <div className="home-functional-column">
                  <header className="home-heading">
                    <div className="home-heading-copy">
                      <h1>
                        <span className="hero-line hero-line-yellow">
                          Antes de construirla,
                        </span>
                        <span className="hero-line hero-line-pink">
                          mira dónde puede romperse.
                        </span>
                      </h1>
                      <p className="home-rude-line">
                        Grumphya revisa viabilidad, riesgos y supuestos de tu
                        idea de app.
                      </p>
                      <HeroRayCluster placement="hero-rays-copy-start" />
                      <HeroRayCluster placement="hero-rays-copy-end" />
                    </div>
                  </header>

                  {workspace}
                </div>
                <div className="home-hero-stage" aria-hidden="true">
                  <span className="home-stage-light" />
                  <span className="home-creature">
                    <img
                      className="home-creature-image"
                      src="/assets/grumphya/home-grumpy-judge.webp"
                      width="400"
                      height="400"
                      alt=""
                      decoding="async"
                    />
                  </span>
                  <HeroRayCluster placement="hero-rays-stage-start" />
                  <HeroRayCluster placement="hero-rays-stage-end" />
                </div>
              </div>

              {feedback}
            </>
          )}
        </IdeaEvaluation>

        <section className="home-marketing" aria-label="Por qué usar Grumphya">
          <div>
            <span className="eyebrow">Antes de enamorarte del roadmap</span>
            <h2>Una mala idea también merece una segunda opinión.</h2>
          </div>
          <p>
            Grumphya señala supuestos, riesgos y agujeros antes de que
            conviertas una ocurrencia en seis meses de trabajo.
          </p>
          <nav className="marketing-links" aria-label="Descubrir Grumphya">
            <a href="/buenas-practicas">Por qué importa</a>
            <a href="/precios">Planes para seguir pensando</a>
            <a href="/descargate">Descárgate a gusto</a>
          </nav>
        </section>

        <div
          className="home-hero-stage home-hero-stage-mobile"
          aria-hidden="true"
        >
          <span className="home-stage-light" />
          <span className="home-creature">
            <img
              className="home-creature-image"
              src="/assets/grumphya/home-grumpy-judge.webp"
              width="400"
              height="400"
              alt=""
              loading="lazy"
              fetchPriority="low"
              decoding="async"
            />
          </span>
          <HeroRayCluster placement="hero-rays-stage-start" />
          <HeroRayCluster placement="hero-rays-stage-end" />
        </div>

        <footer className="home-footer">
          <span className="home-footer-note">Será por malas ideas.</span>
          <AccreditationSeal />
        </footer>
      </main>
      {isMobileMenuOpen
        ? createPortal(
            <>
              <button
                className="mobile-menu-backdrop"
                type="button"
                aria-hidden="true"
                tabIndex={-1}
                onClick={closeMobileMenu}
              />
              <div
                ref={mobileMenuRef}
                className={`home-mobile-menu mobile-menu-portal theme-${theme}${hasNavigationOverflow ? " navigation-overflow" : ""}`}
                role="dialog"
                aria-modal="true"
                aria-label="Menú de navegación"
              >
                <nav id="home-sections-menu" aria-label="Secciones principales">
                  <a href="/" aria-current="page">
                    Inicio
                  </a>
                  {getHomeNavSections(isAdmin).map((section) => (
                    <a href={section.path} key={section.path}>
                      {section.label}
                    </a>
                  ))}
                  <AccountActions
                    isAuthenticated={session.isAuthenticated}
                    avatarUrl={session.avatarUrl}
                    isSigningOut={session.isSigningOut}
                    onSignOut={() => void session.signOut()}
                    variant="home"
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
