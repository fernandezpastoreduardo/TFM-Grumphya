import "./home.scss";
import { useAnonymousUsage } from "../shared/hooks/use-anonymous-usage";
import { ErrorPages } from "../features/error-pages/error-pages";
import { usePersistentTheme } from "../shared/hooks/use-persistent-theme";
import { useMobileMenu } from "../shared/hooks/use-mobile-menu";
import { useSessionStatus } from "../infrastructure/auth/use-session-status";
import { AccreditationSeal } from "../shared/components/accreditation-seal";
import { SiteHeader } from "../shared/components/site-header";
import { IdeaEvaluation } from "../features/idea-evaluation/idea-evaluation";

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

  if (anonymousUsage.errorStatus === 429) {
    return <ErrorPages status="429" detail={anonymousUsage.error} />;
  }

  return (
    <div
      className={`home-page theme-${theme}${isMobileMenuOpen ? " menu-open" : ""}`}
    >
      <main className="home-shell">
        <SiteHeader
          variant="home"
          currentPath="/"
          theme={theme}
          onThemeToggle={toggleTheme}
          isMenuOpen={isMobileMenuOpen}
          onMenuToggle={toggleMobileMenu}
          onMenuClose={closeMobileMenu}
          menuTriggerRef={mobileMenuTriggerRef}
          menuRef={mobileMenuRef}
          isAuthenticated={session.isAuthenticated}
          isAdmin={session.accountAttempts?.isAdmin === true}
          isSigningOut={session.isSigningOut}
          avatarUrl={session.avatarUrl}
          onSignOut={() => void session.signOut()}
        />

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
    </div>
  );
}
