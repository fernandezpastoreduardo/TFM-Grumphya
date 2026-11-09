export type AccreditationAssurance = {
  id: string;
  title: string;
  description: string;
  evidence: string;
  limitation: string;
};

export type AccreditationRecord = {
  id: string;
  issuer: string;
  application: string;
  authorizedDomains: string[];
  status: string;
  issuedAt: string | null;
  validatedAt: string | null;
  validationMethod: string;
  expiresAt: string | null;
  scope: string;
  criteria: string[];
  assurances: AccreditationAssurance[];
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
    issuer: "Grumphya · revisión interna",
    application: "Grumphya",
    authorizedDomains: ["grumphya.com"],
    status: "demonstration",
    issuedAt: "2026-10-28T09:38:54.000Z",
    validatedAt: "2026-10-28T10:45:48.000Z",
    validationMethod: "Revisión técnica interna de código y pruebas",
    expiresAt: null,
    scope:
      "Ficha demostrativa del TFM para la aplicación web Grumphya y el dominio grumphya.com. Resume controles presentes en el código y pruebas internas a la fecha indicada; no es una certificación externa ni una garantía de seguridad absoluta.",
    criteria: [
      "Privacidad, información y control de los datos personales",
      "Recursos propios y ausencia de seguimiento de terceros en los recorridos revisados",
      "Protección de credenciales y transporte de datos",
      "Control de acceso, pruebas y revisión del despliegue",
    ],
    assurances: [
      {
        id: "privacy",
        title: "Privacidad orientada al RGPD",
        description:
          "La aplicación informa del uso de datos, permite retirar el consentimiento para clasificaciones públicas y ofrece eliminación de cuenta. Hay mecanismos de retención de datos.",
        evidence:
          "Política de privacidad, código de consentimiento y borrado de cuenta, y pruebas de retención documentadas en el proyecto.",
        limitation:
          "La revisión jurídica, los proveedores y la configuración efectiva de producción siguen pendientes de comprobación completa; no se declara cumplimiento RGPD certificado.",
      },
      {
        id: "first-party",
        title: "Sin seguimiento de terceros en el navegador",
        description:
          "La web mide páginas públicas y selecciones de plan con contadores propios agregados, sin cookies de analítica ni seguimiento de terceros. Los recursos y llamadas revisados se sirven desde el propio dominio.",
        evidence:
          "Inspección de recursos y cookies del frontend y prueba de peticiones del navegador en recorridos públicos.",
        limitation:
          "La API sí se comunica con OpenAI y el correo IONOS para funciones solicitadas. Las cookies propias requieren su propia evaluación legal y conviene repetir la revisión tras cada cambio.",
      },
      {
        id: "transport",
        title: "Tráfico cifrado y credenciales protegidas",
        description:
          "HTTPS cifra el tráfico entre navegador y servidor y el despliegue configura cabeceras de protección. Las cookies de sesión son HttpOnly, SameSite=Strict y Secure en producción; las contraseñas nuevas se almacenan mediante hash irreversible.",
        evidence:
          "Configuración de Caddy, opciones de cookies y código de hashing bcrypt con prehash SHA-256 revisados en el repositorio.",
        limitation:
          "No se ha verificado el cifrado integral de la base de datos en reposo ni todas las opciones efectivas del servidor publicado.",
      },
      {
        id: "delivery",
        title: "Acceso y cambios sometidos a pruebas",
        description:
          "La API aplica controles de autenticación, permisos y límites de uso. El flujo de integración ejecuta pruebas, auditoría de dependencias y escaneo de imágenes.",
        evidence:
          "Pruebas de API y navegador, configuración de GitHub Actions y comprobaciones de seguridad del despliegue.",
        limitation:
          "Las pruebas reducen riesgos, pero no sustituyen una auditoría independiente ni garantizan que futuras versiones superen los mismos controles.",
      },
    ],
    disclaimer:
      "Demostración académica de un Trabajo Fin de Máster. La validación indicada es interna y limitada a las evidencias descritas; no constituye una certificación oficial, una auditoría independiente, una declaración legal de cumplimiento RGPD ni una garantía de ausencia de vulnerabilidades.",
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
      validatedAt: record.validatedAt,
      validationMethod: record.validationMethod,
      expiresAt: record.expiresAt,
      scope: record.scope,
      criteria: [...record.criteria],
      assurances: record.assurances.map((assurance) => ({ ...assurance })),
      disclaimer: record.disclaimer,
    };
  }
}
