import { useEffect, useState } from "react";
import {
  getAccreditation,
  type AccreditationRecord,
  type AccreditationStatus,
} from "../../shared/accreditation-verification";
import "./accreditation-verification.scss";

type VerificationState =
  | { kind: "loading" }
  | { kind: "success"; record: AccreditationRecord }
  | { kind: "error" };

const STATUS_LABELS: Record<AccreditationStatus, string> = {
  demonstration: "Prototipo académico",
  suspended: "Suspendida",
  revoked: "Revocada",
  expired: "Caducada",
  unknown: "Estado desconocido",
};

function formatDate(value: string | null): string {
  if (value === null) return "No definida";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No definida";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Madrid",
  }).format(date);
}

export function AccreditationVerification() {
  const [state, setState] = useState<VerificationState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    getAccreditation()
      .then((record) => {
        if (active) setState({ kind: "success", record });
      })
      .catch(() => {
        if (active) setState({ kind: "error" });
      });
    return () => {
      active = false;
    };
  }, []);

  if (state.kind === "loading") {
    return <p role="status">Consultando el registro de Desarrollo Seguro…</p>;
  }
  if (state.kind === "error") {
    return (
      <p className="accreditation-error" role="alert">
        No se puede verificar esta ficha en este momento. No consideres válido
        ningún sello hasta consultar el registro.
      </p>
    );
  }

  const { record } = state;
  return (
    <article
      className="accreditation-verification"
      aria-label="Ficha de verificación de Desarrollo Seguro"
    >
      <img
        className="accreditation-logo"
        src="/assets/desarrollo-seguro/logo-l4.webp"
        width="640"
        height="585"
        alt="Logotipo de Desarrollo Seguro"
        decoding="async"
      />
      <p className="accreditation-status">{STATUS_LABELS[record.status]}</p>
      <p className="accreditation-intro">
        Esta ficha resume una revisión técnica interna del proyecto. Cada medida
        indica qué se observó y qué queda fuera de la comprobación.
      </p>
      <dl className="accreditation-facts">
        <div>
          <dt>Entidad emisora</dt>
          <dd>{record.issuer}</dd>
        </div>
        <div>
          <dt>Aplicación</dt>
          <dd>{record.application}</dd>
        </div>
        <div>
          <dt>Identificador</dt>
          <dd>{record.id}</dd>
        </div>
        <div>
          <dt>Fecha de expedición de la ficha</dt>
          <dd>{formatDate(record.issuedAt)}</dd>
        </div>
        <div>
          <dt>Última validación técnica interna</dt>
          <dd>{formatDate(record.validatedAt)}</dd>
        </div>
        <div>
          <dt>Método de validación</dt>
          <dd>{record.validationMethod}</dd>
        </div>
        <div>
          <dt>Fecha de caducidad</dt>
          <dd>{formatDate(record.expiresAt)}</dd>
        </div>
      </dl>
      <section aria-labelledby="accreditation-domains-title">
        <h2 id="accreditation-domains-title">Dominios autorizados</h2>
        <ul>
          {record.authorizedDomains.map((domain) => (
            <li key={domain}>{domain}</li>
          ))}
        </ul>
        <p>
          Compara este dominio con la dirección del sitio donde encontraste el
          sello. El sello puede copiarse; esta ficha no confirma por sí sola el
          sitio de origen.
        </p>
      </section>
      <section aria-labelledby="accreditation-scope-title">
        <h2 id="accreditation-scope-title">Alcance de la revisión</h2>
        <p>{record.scope}</p>
        <ul>
          {record.criteria.map((criterion) => (
            <li key={criterion}>{criterion}</li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="accreditation-assurances-title">
        <h2 id="accreditation-assurances-title">Medidas y evidencias</h2>
        <div className="accreditation-assurances">
          {record.assurances.map((assurance) => (
            <section className="accreditation-assurance" key={assurance.id}>
              <h3>{assurance.title}</h3>
              <p>{assurance.description}</p>
              <p>
                <strong>Evidencia:</strong> {assurance.evidence}
              </p>
              <p>
                <strong>Límite:</strong> {assurance.limitation}
              </p>
            </section>
          ))}
        </div>
      </section>
      <p className="accreditation-disclaimer">{record.disclaimer}</p>
    </article>
  );
}
