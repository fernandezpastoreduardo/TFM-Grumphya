import { STATUS_LABELS } from "./accreditation-verification.constants";
import { formatAccreditationDate } from "./accreditation-verification.formatters";
import { useAccreditationVerification } from "./use-accreditation-verification";
import "./accreditation-verification.scss";

export function AccreditationVerification() {
  const state = useAccreditationVerification();

  if (state.kind === "loading") {
    return <p role="status">Consultando la ficha interna de Grumphya…</p>;
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
      aria-label="Ficha de revisión interna de Grumphya"
    >
      <div className="accreditation-brand">
        <img
          src="/assets/desarrolloseguro.org/icon.svg"
          width="128"
          height="128"
          alt=""
          aria-hidden="true"
          decoding="async"
        />
        <span>Grumphya · revisión interna</span>
      </div>
      <p className="accreditation-status">{STATUS_LABELS[record.status]}</p>
      <p className="accreditation-intro">
        Esta ficha resume una revisión técnica interna del proyecto. Cada medida
        indica qué se observó y qué queda fuera de la comprobación.
      </p>
      <dl className="accreditation-facts">
        <div>
          <dt>Responsable de la ficha</dt>
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
          <dd>{formatAccreditationDate(record.issuedAt)}</dd>
        </div>
        <div>
          <dt>Última validación técnica interna</dt>
          <dd>{formatAccreditationDate(record.validatedAt)}</dd>
        </div>
        <div>
          <dt>Método de validación</dt>
          <dd>{record.validationMethod}</dd>
        </div>
        <div>
          <dt>Fecha de caducidad</dt>
          <dd>{formatAccreditationDate(record.expiresAt)}</dd>
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
