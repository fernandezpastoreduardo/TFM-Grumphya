import { useState } from "react";
import "./pricing.scss";

export function Pricing() {
  const [showLesson, setShowLesson] = useState(false);
  const [selectingPlan, setSelectingPlan] = useState<"ILUMINADO" | "FALTON" | null>(null);
  const [selectionError, setSelectionError] = useState("");

  async function selectPlan(plan: "ILUMINADO" | "FALTON") {
    setSelectionError("");
    setSelectingPlan(plan);
    try {
      const response = await fetch("/api/registration-intents", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!response.ok) {
        setSelectionError("No se ha podido seleccionar el plan. Inténtalo de nuevo.");
        return;
      }
      window.location.assign("/crear-cuenta");
    } catch {
      setSelectionError("No se ha podido seleccionar el plan. Inténtalo de nuevo.");
    } finally {
      setSelectingPlan(null);
    }
  }

  return (
    <>
      {selectionError ? <p className="registration-error" role="alert">{selectionError}</p> : null}
      <div className="pricing-grid">
        <article className="price-card price-card-illuminated">
          <span className="plan-tag">Para evaluar ideas</span>
          <h2>Iluminado</h2>
          <p className="price-value">
            2 €<small> / mes</small>
          </p>
          <p className="plan-description">
            Once oportunidades al día para poner tu idea a prueba. Sí, once.
          </p>
          <ul>
            <li>11 evaluaciones al día</li>
            <li>Modo suave o modo “dame lo peor”</li>
            <li>Historial de tus ideas</li>
          </ul>
          <button className="button-primary" type="button" disabled={selectingPlan !== null} onClick={() => void selectPlan("ILUMINADO")}>
            {selectingPlan === "ILUMINADO" ? "Preparando…" : "Elegir Iluminado"} <span aria-hidden="true">↗</span>
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
          <button className="button-primary" type="button" disabled={selectingPlan !== null} onClick={() => void selectPlan("FALTON")}>
            {selectingPlan === "FALTON" ? "Preparando…" : "Elegir Faltón"} <span aria-hidden="true">↗</span>
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
      {showLesson ? (
        <dialog
          open
          className="prototype-dialog"
          aria-labelledby="ultra-dialog-title"
        >
          <button
            className="dialog-close"
            type="button"
            aria-label="Cerrar"
            onClick={() => setShowLesson(false)}
          >
            ×
          </button>
          <span className="dialog-flashlight" aria-hidden="true">
            ◉
          </span>
          <span className="eyebrow">Una lección gratis</span>
          <h2 id="ultra-dialog-title">¿Aún estamos así de verde?</h2>
          <p>
            La IA es cara. NADIE te ofrecerá algo potenciado por IA sin cobrarte
            más al mes o por cada uso.
          </p>
          <p>
            Si lo hacen, será porque venderán tus datos, y aquí no hacemos eso.
          </p>
          <strong>
            Tus buenas ideas, las aprobadas, son tuyas y solo tuyas.
          </strong>
        </dialog>
      ) : null}
    </>
  );
}
