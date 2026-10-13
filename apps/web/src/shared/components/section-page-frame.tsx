import { useState, type ReactNode } from "react";

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
  { path: "/login", label: "Entrar" },
] as const;

function SectionHeader({
  theme,
  onThemeToggle,
}: {
  theme: "light" | "dark";
  onThemeToggle: () => void;
}) {
  return (
    <header className="site-header">
      <a className="site-brand" href="/" aria-label="Grumphya, inicio">
        <span className="brand-mark" aria-hidden="true">
          g
        </span>
        <span>Grumphya</span>
      </a>
      <nav className="site-nav" aria-label="Navegación principal">
        <a href="/" className="site-nav-home">
          Evaluar idea
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
      <button
        className="site-theme-toggle"
        type="button"
        aria-label={
          theme === "light" ? "Activar modo oscuro" : "Activar modo claro"
        }
        aria-pressed={theme === "dark"}
        onClick={onThemeToggle}
      >
        <span aria-hidden="true">{theme === "light" ? "☾" : "☀"}</span>
        <span>{theme === "light" ? "Oscuro" : "Claro"}</span>
      </button>
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
        <h1>{page.title}</h1>
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
  const [theme, setTheme] = useState<"light" | "dark">("light");
  return (
    <div className={`app-page theme-${theme}`}>
      <div className="app-frame">
        <SectionHeader
          theme={theme}
          onThemeToggle={() => setTheme(theme === "light" ? "dark" : "light")}
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
    </div>
  );
}
