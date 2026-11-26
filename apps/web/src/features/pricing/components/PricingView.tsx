import { lazy, Suspense, useState } from "react";
import type { PricingPlan } from "../pricing.constants";

const PricingLessonDialog = lazy(() =>
  import("./PricingLessonDialog").then((module) => ({
    default: module.PricingLessonDialog,
  })),
);

export function PricingView({
  isAuthenticated,
  selectingPlan,
  selectionError,
  challengeNotice,
  onSelectPlan,
}: {
  isAuthenticated: boolean | null;
  selectingPlan: PricingPlan | null;
  selectionError: string;
  challengeNotice: string;
  onSelectPlan: (plan: PricingPlan) => void;
}) {
  const [showLesson, setShowLesson] = useState(false);

  return (
    <>
      {selectionError ? (
        <p className="registration-error" role="alert">
          {selectionError}
        </p>
      ) : null}
      {challengeNotice ? (
        <p className="registration-status" role="status">
          {challengeNotice}
        </p>
      ) : null}
      <div className="pricing-grid">
        <article className="price-card price-card-illuminated">
          <span className="plan-tag">Para evaluar ideas</span>
          <h2>Iluminado</h2>
          <p className="price-value">
            3 €<small> / mes</small>
          </p>
          <p className="plan-description">
            Once oportunidades al día para poner tu idea a prueba. Sí, once.
          </p>
          <ul>
            <li>11 evaluaciones al día</li>
            <li>Modo suave o modo “dame lo peor”</li>
            <li>Historial de tus ideas</li>
          </ul>
          <button
            className="button-primary"
            type="button"
            disabled={selectingPlan !== null || isAuthenticated === null}
            onClick={() => void onSelectPlan("ILUMINADO")}
          >
            {selectingPlan === "ILUMINADO" ? "Preparando…" : "Elegir Iluminado"}{" "}
            <span aria-hidden="true">↗</span>
          </button>
          <p className="prototype-stamp">
            Contratación simulada · no se procesa ningún pago.
          </p>
        </article>
        <article className="price-card price-card-roast">
          <span className="plan-tag">Para quien no se calla</span>
          <h2>Faltón</h2>
          <p className="price-value">
            1 €<small> / mes</small>
          </p>
          <p className="plan-description">
            Once respuestas diarias para desahogarte con la única IA que no te
            va a bloquear.
          </p>
          <ul>
            <li>11 envíos de roast al día</li>
            <li>Acceso a respuestas ampliadas</li>
            <li>Ranking “Heckler del día” previsto</li>
          </ul>
          <button
            className="button-primary"
            type="button"
            disabled={selectingPlan !== null || isAuthenticated === null}
            onClick={() => void onSelectPlan("FALTON")}
          >
            {selectingPlan === "FALTON" ? "Preparando…" : "Elegir Faltón"}{" "}
            <span aria-hidden="true">↗</span>
          </button>
          <p className="prototype-stamp">
            Contratación simulada · no se procesa ningún pago.
          </p>
        </article>
        <button
          className="ultra-card"
          type="button"
          onClick={() => setShowLesson(true)}
        >
          <span className="ultra-sticker">NO TAN RÁPIDO</span>
          <span className="eyebrow">La oferta sospechosamente buena</span>
          <strong>UltraChachi</strong>
          <span className="ultra-price">
            10 € <small>por todo para siempre*</small>
          </span>
          <span className="ultra-action">
            Pulsar para descubrir la trampa <span aria-hidden="true">↗</span>
          </span>
          <small>* No contratable. Respira.</small>
        </button>
      </div>
      <p className="plan-renewal-copy">
        Un mes, sin renovación automática. Si quieres seguir, vuelves a
        contratar; no tendrás que perseguir un botón de cancelar. Somos
        gruñones, no una trampa.
      </p>
      {showLesson ? (
        <Suspense fallback={null}>
          <PricingLessonDialog onClose={() => setShowLesson(false)} />
        </Suspense>
      ) : null}
    </>
  );
}
