import { type ReactNode } from "react";
import "./section-page-frame.scss";
import { usePersistentTheme } from "../hooks/use-persistent-theme";
import { useMobileMenu } from "../hooks/use-mobile-menu";
import { useSessionStatus } from "../../infrastructure/auth/use-session-status";
import { AccreditationSeal } from "./accreditation-seal";
import { SiteHeader } from "./site-header";

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

type SectionMascot = NonNullable<SectionPageMeta["mascot"]>;

const MOBILE_MASCOT_ASSETS: Record<SectionMascot, string> = {
  judge: "/assets/grumphya/mascot-crossed-arms.webp",
  pointing: "/assets/grumphya/mascot-pointing.svg",
  plans: "/assets/grumphya/plans-coffee.svg",
  "good-practices": "/assets/grumphya/good-practices-checklist.svg",
  roast: "/assets/grumphya/descargate-boxing-bag.svg",
  "worst-ideas": "/assets/grumphya/worst-ideas-wall.webp",
  login: "/assets/grumphya/login-credentials.svg",
  "notable-humans": "/assets/grumphya/notable-humans-hero.svg",
  contact: "/assets/grumphya/contact-hero-phone.svg",
  profile: "/assets/grumphya/mascot-crossed-arms.webp",
  admin: "/assets/grumphya/admin-dashboard-audit.svg",
  register: "/assets/grumphya/mascot-crossed-arms.webp",
};

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
  mascot,
  mobile = false,
}: {
  mascotClass: string;
  mascot?: SectionMascot;
  mobile?: boolean;
}) {
  return (
    <div
      className={`${mobile ? "section-mobile-mascot" : "section-hero-mascot"}${mascotClass}`}
      role="img"
      aria-label="Grumphya, la criatura que examina las ideas"
    >
      {mobile ? (
        <img
          className="section-mobile-mascot-image"
          src={
            mascot ? MOBILE_MASCOT_ASSETS[mascot] : MOBILE_MASCOT_ASSETS.judge
          }
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
        />
      ) : null}
    </div>
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
  const { theme, toggleTheme } = usePersistentTheme();
  const {
    isOpen: isMenuOpen,
    toggle: toggleMenu,
    close: closeMenu,
    triggerRef: menuTriggerRef,
    menuRef,
  } = useMobileMenu();
  const session = useSessionStatus();
  const isAdmin = session.accountAttempts?.isAdmin === true;

  return (
    <div className={`app-page theme-${theme}${isMenuOpen ? " menu-open" : ""}`}>
      <div className="app-frame">
        <SiteHeader
          variant="section"
          currentPath={currentPath}
          theme={theme}
          onThemeToggle={toggleTheme}
          isMenuOpen={isMenuOpen}
          onMenuToggle={toggleMenu}
          onMenuClose={closeMenu}
          menuTriggerRef={menuTriggerRef}
          menuRef={menuRef}
          isAuthenticated={session.isAuthenticated}
          isAdmin={isAdmin}
          isSigningOut={session.isSigningOut}
          avatarUrl={session.avatarUrl}
          onSignOut={() => void session.signOut()}
        />
        <main className="section-main">
          {showHero ? <SectionHero page={page} /> : null}
          {children}
          {showHero && page.mascot ? (
            <SectionHeroMascot
              mascotClass={` mascot-${page.mascot}`}
              mascot={page.mascot}
              mobile
            />
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
    </div>
  );
}
