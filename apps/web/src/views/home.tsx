import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GetUserIdea } from "../features/get-user-idea/get-user-idea";
import { EvaluationResult } from "../features/idea-evaluation/components/EvaluationResult";
import {
  evaluationProcess,
  type EvaluationProcessResult,
} from "../features/idea-evaluation/evaluation-process";

type Health = { status: "ok"; database: "ok"; pgvector: string };
const API_HEALTH_PATH = "/api/health";
const EVALUATION_FAILURE_MESSAGE =
  "No se pudo completar el scoring. La idea sigue en el formulario; inténtalo otra vez.";
const EVALUATION_LOADING_MESSAGE = "Evaluando tu idea. La espera no la mejora.";
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

function isHealthResponse(value: unknown): value is Health {
  if (typeof value !== "object" || value === null) return false;
  if (
    !("status" in value) ||
    !("database" in value) ||
    !("pgvector" in value)
  ) {
    return false;
  }
  return (
    value.status === "ok" &&
    value.database === "ok" &&
    typeof value.pgvector === "string"
  );
}

export function Home() {
  const [health, setHealth] = useState<Health | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] =
    useState<EvaluationProcessResult | null>(null);
  const [evaluationError, setEvaluationError] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    fetch(API_HEALTH_PATH)
      .then(async (response) => {
        if (!response.ok) return null;
        const payload: unknown = await response.json();
        return isHealthResponse(payload) ? payload : null;
      })
      .then((result) => {
        if (isMounted) setHealth(result);
      })
      .catch(() => {
        if (isMounted) setHealth(null);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleEvaluation(request: {
    ideaText: string;
    tone: "soft" | "hard";
  }) {
    setEvaluationResult(null);
    setEvaluationError("");
    setIsEvaluating(true);
    try {
      const result = await evaluationProcess(request);
      setEvaluationResult(result);
    } catch {
      setEvaluationError(EVALUATION_FAILURE_MESSAGE);
    } finally {
      setIsEvaluating(false);
    }
  }

  return (
    <div
      className={`home-page theme-${theme}${isMobileMenuOpen ? " menu-open" : ""}`}
    >
      <main className="home-shell">
        <header className="home-topbar">
          <a className="home-brand" href="/" aria-label="Grumphya, inicio">
            Grumphya
          </a>
          <nav className="home-nav-links" aria-label="Secciones principales">
            <a
              className="home-nav-link is-current"
              href="/"
              aria-current="page"
            >
              Inicio
            </a>
            {NAV_SECTIONS.map((section) => (
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
            <a className="home-login-button" href="/login">
              Entrar
            </a>
            <a className="home-register-button" href="/precios">
              Crear cuenta
            </a>
            <button
              className="theme-toggle"
              type="button"
              role="switch"
              aria-label={
                theme === "light" ? THEME_LABEL.LIGHT : THEME_LABEL.DARK
              }
              aria-checked={theme === "dark"}
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
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
            <div className="home-mobile-menu">
              <button
                className="mobile-menu-trigger"
                type="button"
                aria-label={
                  isMobileMenuOpen ? "Cerrar menú" : "Abrir menú de secciones"
                }
                aria-expanded={isMobileMenuOpen}
                aria-controls="home-sections-menu"
                onClick={() => setIsMobileMenuOpen((open) => !open)}
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

        <header className="home-heading">
          <div className="home-hero-strip">
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
                Grumphya revisa viabilidad, riesgos y supuestos de tu idea de
                app.
              </p>
              <HeroRayCluster placement="hero-rays-copy-start" />
              <HeroRayCluster placement="hero-rays-copy-end" />
            </div>
            <div className="home-hero-stage" aria-hidden="true">
              <span className="home-stage-light" />
              <span className="home-creature" />
              <HeroRayCluster placement="hero-rays-stage-start" />
              <HeroRayCluster placement="hero-rays-stage-end" />
            </div>
          </div>
        </header>

        <section className="home-workspace" aria-label="Preparar una idea">
          <GetUserIdea
            onSubmit={(request) => void handleEvaluation(request)}
            isSubmitting={isEvaluating}
          />
          <p className="home-manifesto">
            Porque poder hacerlo no significa que debas hacerlo.
          </p>
        </section>

        <section
          className="home-result"
          aria-label="Resultado de la evaluación"
          aria-live="polite"
        >
          {isEvaluating ? (
            <p className="home-result-status" role="status">
              {EVALUATION_LOADING_MESSAGE}
            </p>
          ) : null}
          {evaluationError ? (
            <p className="home-result-error" role="alert">
              {evaluationError}
            </p>
          ) : null}
          {evaluationResult ? (
            <EvaluationResult result={evaluationResult} />
          ) : null}
        </section>

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

        <footer className="home-footer">
          <span
            className={
              health ? "home-health-light is-online" : "home-health-light"
            }
            aria-hidden="true"
          />
          <span>
            {health
              ? `Servicios listos · PostgreSQL ${health.pgvector} con pgvector`
              : "Conectando con los servicios…"}
          </span>
          <span className="home-footer-note">Será por malas ideas.</span>
        </footer>
      </main>
      {isMobileMenuOpen
        ? createPortal(
            <>
              <button
                className="mobile-menu-backdrop"
                type="button"
                aria-label="Cerrar menú"
                onClick={() => setIsMobileMenuOpen(false)}
              />
              <div className="home-mobile-menu mobile-menu-portal">
                <nav id="home-sections-menu" aria-label="Secciones principales">
                  <a href="/" aria-current="page">
                    Inicio
                  </a>
                  {NAV_SECTIONS.map((section) => (
                    <a href={section.path} key={section.path}>
                      {section.label}
                    </a>
                  ))}
                  <a href="/login">Entrar</a>
                  <a href="/precios">Crear cuenta</a>
                </nav>
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
