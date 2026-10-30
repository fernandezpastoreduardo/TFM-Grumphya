import { useState } from "react";
import { useSessionStatus } from "../../infrastructure/auth/use-session-status";
import { useNativeDialog } from "../../shared/hooks/use-native-dialog";
import {
  LoadingSkeleton,
  SkeletonBlock,
} from "../../shared/components/loading-skeleton";
import { SubmitContactMessage } from "../submit-contact-message/submit-contact-message";
import "./contact.scss";

export function Contact() {
  const session = useSessionStatus();
  if (session.isAuthenticated === null) {
    return (
      <LoadingSkeleton
        label="Comprobando tu sesión"
        className="contact-skeleton"
        showImmediately
      >
        <section className="content-card contact-card contact-skeleton-form">
          <SkeletonBlock className="skeleton-contact-title" />
          <SkeletonBlock className="skeleton-contact-heading" />
          <div className="contact-skeleton-fields">
            <div className="contact-skeleton-field">
              <SkeletonBlock className="skeleton-contact-label" />
              <SkeletonBlock className="skeleton-contact-input" />
            </div>
            <div className="contact-skeleton-field">
              <SkeletonBlock className="skeleton-contact-label" />
              <SkeletonBlock className="skeleton-contact-input" />
            </div>
            <div className="contact-skeleton-field">
              <SkeletonBlock className="skeleton-contact-label" />
              <SkeletonBlock className="skeleton-contact-message" />
            </div>
          </div>
          <SkeletonBlock className="skeleton-contact-button" />
          <SkeletonBlock className="skeleton-contact-note" />
        </section>
        <aside className="contact-side contact-skeleton-aside">
          <SkeletonBlock className="skeleton-contact-creature" />
          <SkeletonBlock className="skeleton-contact-copy" />
        </aside>
        <SkeletonBlock className="skeleton-contact-stamp" />
      </LoadingSkeleton>
    );
  }
  if (session.isAuthenticated) return <SubmitContactMessage />;
  return <AnonymousContactDemo />;
}

function AnonymousContactDemo() {
  const [dismissed, setDismissed] = useState(false);
  const dialogRef = useNativeDialog(dismissed);

  function dismissForm() {
    setDismissed(true);
  }
  return (
    <div className="contact-layout">
      <section
        className={`content-card contact-card ${dismissed ? "contact-faded" : ""}`}
        aria-labelledby="contact-form-title"
      >
        <span className="eyebrow">Formulario de contacto</span>
        <h2 id="contact-form-title">Escribe lo que nadie te ha pedido</h2>
        <form
          onFocusCapture={dismissForm}
          onSubmit={(event) => {
            event.preventDefault();
            dismissForm();
          }}
        >
          <label>
            Nombre
            <input type="text" placeholder="Tu nombre" />
          </label>
          <label>
            Email
            <input type="email" placeholder="nombre@ejemplo.es" />
          </label>
          <label>
            Mensaje
            <textarea placeholder="Al grano, por favor." rows={4} />
          </label>
          <button className="button-primary" type="submit">
            Enviar mensaje <span aria-hidden="true">↗</span>
          </button>
        </form>
        <p className="contact-plan-note">
          El formulario de contacto completo está disponible al iniciar sesión.
        </p>
      </section>
      <aside className="contact-side">
        <div className="contact-creature" aria-hidden="true" />
        <p>Prometemos leerlo. Algún día. Quizá con café.</p>
      </aside>
      {dismissed ? (
        <dialog
          ref={dialogRef}
          className="prototype-dialog contact-dialog"
          aria-labelledby="contact-dialog-title"
          aria-modal="true"
          onClose={() => setDismissed(false)}
          onCancel={(event) => {
            event.preventDefault();
            setDismissed(false);
          }}
        >
          <button
            className="dialog-close"
            type="button"
            aria-label="Cerrar"
            onClick={() => setDismissed(false)}
          >
            ×
          </button>
          <img
            className="contact-dialog-mascot"
            src="/assets/grumphya/contact-form-vanishing.svg"
            alt="Grumphya señala un formulario que se desvanece"
          />
          <span className="eyebrow">Grumphya tiene algo que decir</span>
          <h2 id="contact-dialog-title">
            Acéptalo: ahora mismo a nadie le importa lo que tengas que decir.
          </h2>
          <p>
            El formulario se ha esfumado. Si ya tienes cuenta, inicia sesión y
            podrás escribirnos desde el formulario de contacto.
          </p>
        </dialog>
      ) : null}
      <p className="prototype-stamp">
        Vista de demostración; no se envía ningún mensaje.
      </p>
    </div>
  );
}
