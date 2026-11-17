import { useSessionStatus } from "../../infrastructure/auth/use-session-status";
import {
  LoadingSkeleton,
  SkeletonBlock,
} from "../../shared/components/loading-skeleton";
import { AnonymousContactDemo } from "./components/anonymous-contact-demo";
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
