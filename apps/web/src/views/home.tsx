import { useEffect, useState } from "react";
import { GetUserIdea } from "../features/get-user-idea/get-user-idea";
import {
  evaluationProcess,
  formatEvaluationAlert,
} from "../features/idea-evaluation/evaluation-process";

type Health = { status: "ok"; database: "ok"; pgvector: string };
const API_HEALTH_PATH = "/api/health";
const EVALUATION_FAILURE_MESSAGE =
  "No se pudo completar el scoring. La idea sigue en el formulario; inténtalo otra vez.";
const THEME_LABEL = {
  LIGHT: "Activar modo oscuro",
  DARK: "Activar modo claro",
} as const;
const DEFAULT_IDEA_SYNTHESIS = "una app para hacer un Tinder de saltamontes";
const IDEA_SYNTHESIS_MAX_LENGTH = 84;
const NAV_SECTIONS = [
  { id: "worst", label: "Peores ideas" },
  { id: "vent", label: "Descárgate" },
  { id: "humans", label: "Humanos notables" },
  { id: "good-practices", label: "Buenas prácticas" },
  { id: "pricing", label: "Planes" },
  { id: "contact", label: "Contacto" },
] as const;

function getIdeaSynthesis(ideaText: string): string {
  const normalizedText = ideaText.replace(/\s+/g, " ").trim();
  if (!normalizedText) return DEFAULT_IDEA_SYNTHESIS;

  const sentence = normalizedText.split(/[.!?](?:\s|$)/, 1)[0];
  if (!sentence) return DEFAULT_IDEA_SYNTHESIS;
  const title = sentence[0].toLocaleLowerCase("es-ES") + sentence.slice(1);
  if (title.length <= IDEA_SYNTHESIS_MAX_LENGTH) return title;

  const truncatedTitle = title.slice(0, IDEA_SYNTHESIS_MAX_LENGTH).trimEnd();
  const lastSpace = truncatedTitle.lastIndexOf(" ");
  const excerpt =
    lastSpace > 0 ? truncatedTitle.slice(0, lastSpace) : truncatedTitle;
  return `${excerpt}…`;
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
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [ideaSynthesis, setIdeaSynthesis] = useState(DEFAULT_IDEA_SYNTHESIS);
  const [navigationNotice, setNavigationNotice] = useState("");

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
    setIsEvaluating(true);
    try {
      const result = await evaluationProcess(request);
      window.alert(formatEvaluationAlert(result));
    } catch {
      window.alert(EVALUATION_FAILURE_MESSAGE);
    } finally {
      setIsEvaluating(false);
    }
  }

  return (
    <div className={`home-page theme-${theme}`}>
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
              <button
                className="home-nav-link"
                key={section.id}
                type="button"
                onClick={() =>
                  setNavigationNotice(
                    `${section.label} todavía no está conectada. La estamos sacando del horno, no del sombrero.`,
                  )
                }
              >
                {section.label}
              </button>
            ))}
          </nav>
          <div className="home-nav-actions">
            <button
              className="home-login-button"
              type="button"
              onClick={() =>
                setNavigationNotice(
                  "El login todavía no está conectado. Tus credenciales pueden seguir durmiendo tranquilas.",
                )
              }
            >
              Entrar
            </button>
            <button
              className="home-register-button"
              type="button"
              onClick={() =>
                setNavigationNotice(
                  "Crear cuenta aún no está conectado. Primero terminemos la app; qué concepto tan revolucionario.",
                )
              }
            >
              Crear cuenta
            </button>
            <button
              className="theme-toggle"
              type="button"
              aria-label={
                theme === "light" ? THEME_LABEL.LIGHT : THEME_LABEL.DARK
              }
              aria-pressed={theme === "dark"}
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? "Modo oscuro" : "Modo claro"}
            </button>
          </div>
          {navigationNotice ? (
            <p className="home-nav-notice" role="status">
              {navigationNotice}
            </p>
          ) : null}
        </header>

        <header className="home-heading">
          <h1>Venga, al lío.</h1>
          <div className="home-hero-strip">
            <div className="home-heading-copy">
              <p className="home-rude-line">
                La única IA a la que tu idea le importa menos que{" "}
                <strong className="home-idea-synthesis">
                  {ideaSynthesis}.
                </strong>
              </p>
            </div>
            <span className="home-creature" aria-hidden="true" />
          </div>
        </header>

        <section className="home-workspace" aria-label="Preparar una idea">
          <div className="home-workspace-topline">
            <span className="home-step">01</span>
            <div>
              <h2>Vale, sorpréndeme.</h2>
              <p>Tu idea, sin el pitch de gurú. Vamos al grano.</p>
            </div>
          </div>
          <GetUserIdea
            onIdeaChange={(ideaText) =>
              setIdeaSynthesis(getIdeaSynthesis(ideaText))
            }
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
        />

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
    </div>
  );
}
