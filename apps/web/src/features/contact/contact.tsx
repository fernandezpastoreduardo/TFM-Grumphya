import { useState } from "react";
import { useSessionStatus } from "../../infrastructure/auth/use-session-status";
import { useNativeDialog } from "../../shared/hooks/use-native-dialog";
import { usePendingEmailVerification } from "../../shared/hooks/use-pending-email-verification";
import { EmailVerificationRequiredDialog } from "../../shared/components/email-verification-required-dialog";
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
          <span className="eyebrow skeleton-block skeleton-contact-title">
            Formulario de contacto
          </span>
          <h2 className="skeleton-block skeleton-contact-heading">
            Escribe lo que nadie te ha pedido
          </h2>
          <div className="contact-skeleton-fields">
            <label className="contact-skeleton-field">
              Nombre
              <SkeletonBlock className="skeleton-contact-input" />
            </label>
            <label className="contact-skeleton-field">
              Email
              <SkeletonBlock className="skeleton-contact-input" />
            </label>
            <label className="contact-skeleton-field">
              Mensaje
              <SkeletonBlock className="skeleton-contact-message" />
            </label>
          </div>
          <SkeletonBlock className="skeleton-contact-button" />
          <p className="contact-plan-note skeleton-block skeleton-contact-note">
            El formulario de contacto completo está disponible al iniciar
            sesión.
          </p>
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
  const [showVerificationDialog, setShowVerificationDialog] = useState(false);
  const emailVerification = usePendingEmailVerification();
  const dialogRef = useNativeDialog(dismissed);

  async function dismissForm() {
    if (await emailVerification.check()) {
      setShowVerificationDialog(true);
    } else {
      setDismissed(true);
    }
  }
  return (
    <div className="contact-layout contact-anonymous-layout">
      <section
        className={`content-card contact-card ${dismissed ? "contact-faded" : ""}`}
        aria-labelledby="contact-form-title"
      >
        <span className="eyebrow">Formulario de contacto</span>
        <h2 id="contact-form-title">Escribe lo que nadie te ha pedido</h2>
        <form
          onFocusCapture={() => void dismissForm()}
          onSubmit={(event) => {
            event.preventDefault();
            void dismissForm();
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
      <EmailVerificationRequiredDialog
        open={showVerificationDialog}
        onClose={() => setShowVerificationDialog(false)}
      />
      <p className="prototype-stamp">
        Vista de demostración; no se envía ningún mensaje.
      </p>
    </div>
  );
}
