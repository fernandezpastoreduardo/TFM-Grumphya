export type AccreditationRecord = {
  id: string;
  issuer: string;
  application: string;
  authorizedDomains: string[];
  status: string;
  issuedAt: string | null;
  expiresAt: string | null;
  scope: string;
  criteria: string[];
  disclaimer: string;
};

export type PublicAccreditation = Omit<AccreditationRecord, "status"> & {
  status: "demonstration" | "suspended" | "revoked" | "expired" | "unknown";
};

const ACCREDITATION_ID_PATTERN = /^DS-[A-Z0-9]+-\d{4}-\d{3}$/u;

// The single server-owned prototype record is the source of truth. Updating its
// status requires a deployment; the badge itself contains only its public ID.
const PROTOTYPE_RECORDS: readonly AccreditationRecord[] = [
  {
    id: "DS-GRUMPHYA-2026-001",
    issuer: "Desarrollo Seguro",
    application: "Grumphya",
    authorizedDomains: ["grumphya.com"],
    status: "demonstration",
    issuedAt: null,
    expiresAt: null,
    scope:
      "Prototipo académico de la aplicación web Grumphya. El alcance describe áreas propuestas para evaluación, sin declarar controles superados.",
    criteria: [
      "Gestión de identidad, sesiones y control de acceso",
      "Protección de datos personales y privacidad",
      "Pruebas automatizadas y seguridad del despliegue",
    ],
    disclaimer:
      "Demostración académica de un Trabajo Fin de Máster. No constituye una certificación oficial ni una auditoría independiente. Los criterios no acreditan resultados técnicos verificados.",
  },
];

function isValidIsoInstant(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value))
    return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function publicStatus(
  record: AccreditationRecord,
  now: Date,
): PublicAccreditation["status"] {
  if (
    record.status !== "demonstration" &&
    record.status !== "suspended" &&
    record.status !== "revoked" &&
    record.status !== "expired"
  ) {
    return "unknown";
  }
  if (record.status === "revoked" || record.status === "suspended")
    return record.status;
  if (record.expiresAt !== null) {
    if (!isValidIsoInstant(record.expiresAt)) return "unknown";
    if (now.getTime() >= Date.parse(record.expiresAt)) return "expired";
  }
  return record.status;
}

export class GetAccreditation {
  constructor(
    private readonly records: readonly AccreditationRecord[] = PROTOTYPE_RECORDS,
    private readonly now: () => Date = () => new Date(),
  ) {}

  execute(rawId: unknown): PublicAccreditation | null {
    if (
      typeof rawId !== "string" ||
      rawId.length > 80 ||
      !ACCREDITATION_ID_PATTERN.test(rawId)
    ) {
      return null;
    }
    const record = this.records.find((candidate) => candidate.id === rawId);
    if (!record) return null;

    // Explicit projection prevents internal fields from leaking if the source
    // record gains private notes or credentials later.
    return {
      id: record.id,
      issuer: record.issuer,
      application: record.application,
      authorizedDomains: [...record.authorizedDomains],
      status: publicStatus(record, this.now()),
      issuedAt: record.issuedAt,
      expiresAt: record.expiresAt,
      scope: record.scope,
      criteria: [...record.criteria],
      disclaimer: record.disclaimer,
    };
  }
}
