import { useEffect, useState } from "react";
import { authenticatedFetch } from "../../../infrastructure/auth/session";
import { getApplicationErrorLabel } from "../application-error-labels";

type ApplicationErrorDetail = {
  id: string;
  code: string;
  statusCode: number;
  occurredAt: string;
  diagnosticCode: string | null;
  context: { useCase: "idea_evaluation"; inputText: string } | null;
};

type DetailState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; detail: ApplicationErrorDetail };

const ERROR_DETAIL_ERROR = "No se ha podido cargar el detalle de este error.";
const ERROR_EVENT_ID_PATTERN = /^[1-9]\d{0,18}$/u;
const ERROR_CODE_PATTERN = /^[A-Z0-9_]{1,100}$/u;
const DIAGNOSTIC_CODE_PATTERN = /^[a-z][a-z0-9_]{0,99}$/u;
const MAX_SAVED_INPUT_LENGTH = 2_000;
const ERROR_DETAIL_ENDPOINT = "/api/admin/application-errors/";
const EUROPEAN_DATE = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseApplicationErrorDetail(
  value: unknown,
  expectedId: string,
): ApplicationErrorDetail | null {
  if (!isRecord(value)) return null;
  const context = value.context;
  const contextIsValid =
    context === null ||
    (isRecord(context) &&
      context.useCase === "idea_evaluation" &&
      typeof context.inputText === "string" &&
      context.inputText.length <= MAX_SAVED_INPUT_LENGTH);
  if (
    value.id !== expectedId ||
    typeof value.code !== "string" ||
    !ERROR_CODE_PATTERN.test(value.code) ||
    typeof value.statusCode !== "number" ||
    !Number.isInteger(value.statusCode) ||
    value.statusCode < 500 ||
    value.statusCode > 599 ||
    typeof value.occurredAt !== "string" ||
    !Number.isFinite(Date.parse(value.occurredAt)) ||
    (value.diagnosticCode !== null &&
      (typeof value.diagnosticCode !== "string" ||
        !DIAGNOSTIC_CODE_PATTERN.test(value.diagnosticCode))) ||
    !contextIsValid
  ) {
    return null;
  }
  return {
    id: value.id,
    code: value.code,
    statusCode: value.statusCode,
    occurredAt: value.occurredAt,
    diagnosticCode: value.diagnosticCode,
    context:
      context === null
        ? null
        : {
            useCase: "idea_evaluation",
            inputText: String(context.inputText),
          },
  };
}

export function AdminErrorDetail({ eventId }: { eventId: string }) {
  const [state, setState] = useState<DetailState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    if (!ERROR_EVENT_ID_PATTERN.test(eventId)) {
      setState({ status: "error" });
      return () => {
        active = false;
      };
    }
    authenticatedFetch(`${ERROR_DETAIL_ENDPOINT}${encodeURIComponent(eventId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(ERROR_DETAIL_ERROR);
        const detail = parseApplicationErrorDetail(
          await response.json(),
          eventId,
        );
        if (!detail) throw new Error(ERROR_DETAIL_ERROR);
        if (active) setState({ status: "ready", detail });
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [eventId]);

  if (state.status === "loading") {
    return <p role="status">Cargando el detalle del error…</p>;
  }
  if (state.status === "error") {
    return (
      <section className="admin-dashboard-card" role="alert">
        <h2>Error no disponible</h2>
        <p>{ERROR_DETAIL_ERROR}</p>
        <a href="/panel-control">Volver al panel de control</a>
      </section>
    );
  }

  const { detail } = state;
  return (
    <article className="admin-dashboard-card admin-error-detail">
      <a href="/panel-control">Volver al panel de control</a>
      <h2>{getApplicationErrorLabel(detail.code, detail.diagnosticCode)}</h2>
      <dl>
        <div>
          <dt>Fecha y hora</dt>
          <dd>
            <time dateTime={detail.occurredAt}>
              {EUROPEAN_DATE.format(new Date(detail.occurredAt))}
            </time>
          </dd>
        </div>
        <div>
          <dt>Estado HTTP</dt>
          <dd>{detail.statusCode}</dd>
        </div>
        <div>
          <dt>Caso de uso</dt>
          <dd>
            {detail.context?.useCase === "idea_evaluation"
              ? "Evaluación de ideas"
              : "No identificado"}
          </dd>
        </div>
        {detail.diagnosticCode && (
          <div>
            <dt>Diagnóstico interno</dt>
            <dd>
              <code>{detail.diagnosticCode}</code>
            </dd>
          </div>
        )}
      </dl>
      {detail.context ? (
        <section aria-labelledby="admin-error-input-title">
          <h3 id="admin-error-input-title">Texto introducido</h3>
          <pre className="admin-error-input">{detail.context.inputText}</pre>
          <p className="admin-dashboard-note">
            Se conserva de forma temporal para diagnosticar este fallo y se
            elimina junto con el evento de error a los 30 días.
          </p>
        </section>
      ) : (
        <p>No se guardó información de entrada para este evento.</p>
      )}
    </article>
  );
}
