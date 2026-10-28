import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./home.scss";
import "../shared/components/mobile-navigation.scss";
import "../shared/components/shared-components.scss";
import { GetUserIdea } from "../features/get-user-idea/get-user-idea";
import { EvaluationDialog } from "../features/idea-evaluation/components/EvaluationDialog";
import { EvaluationFailureNotice } from "../features/idea-evaluation/components/EvaluationFailureNotice";
import { EvaluationResult } from "../features/idea-evaluation/components/EvaluationResult";
import { SpecialIdeaCaseNotice } from "../features/idea-evaluation/components/SpecialIdeaCaseNotice";
import { SimilarIdeaNotice } from "../features/repeated-ideas/components/SimilarIdeaNotice";
import { useAnonymousUsage } from "../shared/hooks/use-anonymous-usage";
import { ErrorPages } from "../features/error-pages/error-pages";
import { usePersistentTheme } from "../shared/hooks/use-persistent-theme";
import { useMobileMenu } from "../shared/hooks/use-mobile-menu";
import { useNavigationOverflow } from "../shared/hooks/use-navigation-overflow";
import { useSessionStatus } from "../infrastructure/auth/use-session-status";
import { AccountActions } from "../shared/components/account-actions";
import { UsageLimitDialog } from "../shared/components/usage-limit-dialog";
import { AccreditationSeal } from "../shared/components/accreditation-seal";
import {
  evaluationProcess,
  EvaluationProcessError,
  type EvaluationSubmissionResult,
  type SimilarIdeaMatchResult,
  type EvaluationProcessResult,
  type SpecialIdeaCaseResult,
} from "../features/idea-evaluation/evaluation-process";

const EVALUATION_FAILURE_MESSAGE =
  "La evaluación se ha torcido. Ni Grumphya puede arreglarlo con café. No se te ha descontado este intento. Prueba otra vez en un rato.";
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
type HomeEvaluationRequest = {
  ideaText: string;
  tone: "soft" | "hard";
};

function getIdeaAttemptsRemaining(
  isAuthenticated: boolean | null,
  anonymousRemaining: number | undefined,
  accountRemaining: number | undefined,
  hasActiveIdeaPlan: boolean | null,
): number | null | undefined {
  if (isAuthenticated === true) {
    if (hasActiveIdeaPlan === null) return null;
    return hasActiveIdeaPlan ? (accountRemaining ?? null) : anonymousRemaining;
  }
  if (isAuthenticated === false) return anonymousRemaining ?? null;
  return null;
}

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
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] =
    useState<EvaluationProcessResult | null>(null);
  const [similarIdeaMatch, setSimilarIdeaMatch] =
    useState<SimilarIdeaMatchResult | null>(null);
  const [specialIdeaCase, setSpecialIdeaCase] =
    useState<SpecialIdeaCaseResult | null>(null);
  const [pendingEvaluation, setPendingEvaluation] = useState<{
    request: HomeEvaluationRequest;
    idempotencyKey: string;
  } | null>(null);
  const [evaluationError, setEvaluationError] = useState("");
  const [isEvaluationDialogOpen, setIsEvaluationDialogOpen] = useState(false);
  const [ideaStepResetKey, setIdeaStepResetKey] = useState(0);
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
  const [isQuotaDialogOpen, setIsQuotaDialogOpen] = useState(false);
  const [isDailyQuotaDialogOpen, setIsDailyQuotaDialogOpen] = useState(false);
  const quotaDialogRef = useRef<HTMLDialogElement>(null);
  const isEvaluationSubmittingRef = useRef(false);
  const retryableSubmissionRef = useRef<{
    request: HomeEvaluationRequest;
    idempotencyKey: string;
  } | null>(null);
  const anonymousUsage = useAnonymousUsage();
  const session = useSessionStatus();
  const isAdmin = session.accountAttempts?.isAdmin === true;
  const ideaQuotaKind =
    session.isAuthenticated === true &&
    (session.accountAttempts === null ||
      session.accountAttempts.ideasPlanActive)
      ? "account"
      : "anonymous";

  useEffect(() => {
    const dialog = quotaDialogRef.current;
    if (!dialog) return;
    if (isQuotaDialogOpen && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!isQuotaDialogOpen && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [isQuotaDialogOpen]);

  async function handleEvaluation(request: HomeEvaluationRequest) {
    if (isEvaluationSubmittingRef.current) return;
    isEvaluationSubmittingRef.current = true;
    setEvaluationResult(null);
    setSimilarIdeaMatch(null);
    setSpecialIdeaCase(null);
    setEvaluationError("");
    setIsEvaluating(true);
    setIsEvaluationDialogOpen(true);
    const pendingSubmission = retryableSubmissionRef.current;
    const idempotencyKey =
      pendingSubmission &&
      hasSameEvaluationRequest(pendingSubmission.request, request)
        ? pendingSubmission.idempotencyKey
        : crypto.randomUUID();
    retryableSubmissionRef.current = { request, idempotencyKey };
    try {
      const result = await evaluationProcess(request, idempotencyKey);
      applySubmissionResult(result, request, idempotencyKey);
      retryableSubmissionRef.current = null;
    } catch (error: unknown) {
      handleEvaluationError(error);
    } finally {
      isEvaluationSubmittingRef.current = false;
      setIsEvaluating(false);
      await refreshUsage();
    }
  }

  async function handleContinueEvaluation() {
    if (!pendingEvaluation || isEvaluationSubmittingRef.current) return;
    isEvaluationSubmittingRef.current = true;
    setEvaluationError("");
    setIsEvaluating(true);
    setIsEvaluationDialogOpen(true);
    try {
      const result = await evaluationProcess(
        pendingEvaluation.request,
        pendingEvaluation.idempotencyKey,
        true,
      );
      applySubmissionResult(
        result,
        pendingEvaluation.request,
        pendingEvaluation.idempotencyKey,
      );
    } catch (error: unknown) {
      handleEvaluationError(error);
    } finally {
      isEvaluationSubmittingRef.current = false;
      setIsEvaluating(false);
      await refreshUsage();
    }
  }

  function handleEvaluationError(error: unknown) {
    if (error instanceof EvaluationProcessError) {
      if (error.code === "ANONYMOUS_QUOTA_EXHAUSTED") {
        setIsEvaluationDialogOpen(false);
        setIsQuotaDialogOpen(true);
        return;
      }
      if (error.code === "PLAN_QUOTA_EXHAUSTED") {
        setIsEvaluationDialogOpen(false);
        setIsDailyQuotaDialogOpen(true);
        return;
      }
      if (error.code === "ACTIVE_PLAN_REQUIRED") {
        setEvaluationError(error.message);
        return;
      }
      if (error.code === "EVALUATION_OUTCOME_UNKNOWN") {
        setEvaluationError(error.message);
        return;
      }
    }
    setEvaluationError(EVALUATION_FAILURE_MESSAGE);
  }

  function renderEvaluationErrorContent() {
    if (!evaluationError) return null;
    if (evaluationError === EVALUATION_FAILURE_MESSAGE) {
      return <EvaluationFailureNotice message={evaluationError} />;
    }
    return (
      <p className="home-result-error" role="alert">
        {evaluationError}
      </p>
    );
  }

  async function refreshUsage() {
    const refreshResults = await Promise.all([
      anonymousUsage.refresh(),
      session.isAuthenticated === false
        ? Promise.resolve(null)
        : session.refresh(),
    ]);
    const attempts = refreshResults[1];
    if (attempts?.ideasPlanActive && attempts.ideas === 0) {
      setIsDailyQuotaDialogOpen(true);
    }
  }

  function handleEvaluationDialogClose() {
    setIsEvaluationDialogOpen(false);
    setIdeaStepResetKey((currentKey) => currentKey + 1);
  }

  function applySubmissionResult(
    result: EvaluationSubmissionResult,
    request: HomeEvaluationRequest,
    idempotencyKey: string,
  ) {
    if (result.status === "special_case") {
      setEvaluationResult(null);
      setSimilarIdeaMatch(null);
      setSpecialIdeaCase(result);
      setPendingEvaluation(null);
      return;
    }
    if (result.status === "similar_idea_match") {
      setEvaluationResult(null);
      setSpecialIdeaCase(null);
      setSimilarIdeaMatch(result);
      setPendingEvaluation({ request, idempotencyKey });
      return;
    }
    setSimilarIdeaMatch(null);
    setSpecialIdeaCase(null);
    setPendingEvaluation(null);
    setEvaluationResult(result);
  }

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
                  Grumphya revisa viabilidad, riesgos y supuestos de tu idea de
                  app.
                </p>
                <HeroRayCluster placement="hero-rays-copy-start" />
                <HeroRayCluster placement="hero-rays-copy-end" />
              </div>
            </header>

            <section className="home-workspace" aria-label="Preparar una idea">
              <GetUserIdea
                onSubmit={(request) => void handleEvaluation(request)}
                stepResetKey={ideaStepResetKey}
                onQuotaExhausted={
                  ideaQuotaKind === "anonymous"
                    ? () => setIsQuotaDialogOpen(true)
                    : undefined
                }
                isSubmitting={isEvaluating}
                remainingAttempts={getIdeaAttemptsRemaining(
                  session.isAuthenticated,
                  anonymousUsage.usage?.ideas.remaining,
                  session.accountAttempts?.ideas,
                  session.accountAttempts?.ideasPlanActive ?? null,
                )}
                quotaKind={ideaQuotaKind}
                unlimitedAttempts={session.accountAttempts?.isAdmin === true}
              />
              {anonymousUsage.error ? (
                <p className="home-result-error" role="alert">
                  {anonymousUsage.error}
                </p>
              ) : null}
              <p className="home-manifesto">
                Porque poder hacerlo no significa que debas hacerlo.
              </p>
            </section>
          </div>
          <div className="home-hero-stage" aria-hidden="true">
            <span className="home-stage-light" />
            <span className="home-creature" />
            <HeroRayCluster placement="hero-rays-stage-start" />
            <HeroRayCluster placement="hero-rays-stage-end" />
          </div>
        </div>

        <section
          className="home-result"
          aria-label="Resultado de la evaluación"
        >
          {!isEvaluationDialogOpen &&
          (isEvaluating ||
            evaluationError ||
            evaluationResult ||
            similarIdeaMatch ||
            specialIdeaCase) ? (
            <button
              className="evaluation-reopen-button"
              type="button"
              onClick={() => setIsEvaluationDialogOpen(true)}
            >
              {isEvaluating
                ? "Volver a la evaluación en curso"
                : "Volver a ver la evaluación"}
            </button>
          ) : null}
        </section>

        <EvaluationDialog
          open={isEvaluationDialogOpen}
          isEvaluating={isEvaluating}
          onClose={handleEvaluationDialogClose}
        >
          {!isEvaluating ? renderEvaluationErrorContent() : null}
          {!isEvaluating && evaluationResult ? (
            <EvaluationResult result={evaluationResult} />
          ) : null}
          {!isEvaluating && specialIdeaCase ? (
            <SpecialIdeaCaseNotice result={specialIdeaCase} />
          ) : null}
          {!isEvaluating && similarIdeaMatch ? (
            <SimilarIdeaNotice
              match={similarIdeaMatch}
              tone={pendingEvaluation?.request.tone ?? "soft"}
              isSubmitting={isEvaluating}
              onContinue={() => void handleContinueEvaluation()}
            />
          ) : null}
        </EvaluationDialog>

        {isQuotaDialogOpen ? (
          <dialog
            ref={quotaDialogRef}
            className="quota-exhausted-dialog"
            aria-labelledby="quota-exhausted-title"
            aria-describedby="quota-exhausted-copy"
            onClose={() => setIsQuotaDialogOpen(false)}
          >
            <button
              className="quota-dialog-close"
              type="button"
              aria-label="Cerrar aviso de usos gratuitos agotados"
              onClick={() => setIsQuotaDialogOpen(false)}
            >
              ×
            </button>
            <img
              src="/assets/grumphya/mascot-neutral.svg"
              alt="Grumphya esperando un café"
            />
            <span className="eyebrow">El café se ha terminado</span>
            <h2 id="quota-exhausted-title">Ya conoces el método</h2>
            <p id="quota-exhausted-copy">
              Ahora que sabes cómo va la app, te cuento el detalle: funciono a
              base de café. Tus tres pruebas gratis ya se han agotado. No se
              reinician: cada navegador tiene tres evaluaciones de por vida.
            </p>
            <a className="button-primary" href="/precios">
              A ver lo que cuesta un café <span aria-hidden="true">↗</span>
            </a>
          </dialog>
        ) : null}
        {isDailyQuotaDialogOpen ? (
          <UsageLimitDialog
            open
            scope="ideas"
            onClose={() => setIsDailyQuotaDialogOpen(false)}
          />
        ) : null}

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
          <span className="home-creature" />
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

function hasSameEvaluationRequest(
  first: HomeEvaluationRequest,
  second: HomeEvaluationRequest,
): boolean {
  return first.ideaText === second.ideaText && first.tone === second.tone;
}
