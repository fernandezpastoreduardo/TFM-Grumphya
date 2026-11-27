import {
  PROCESSOR_INVENTORY_POLICY_URL,
  type ProcessorDisclosure,
} from "./processor-inventory.models";

const PRIVACY_POLICY_REVISION = "v8";
const PROVIDER_SECTION = "privacy-providers-title";
const OPENAI_PURPOSE =
  "OpenAI interviene como proveedor técnico de las funciones de IA: puede recibir el texto de ideas o mensajes para generar respuestas y la imagen procesada cuando se solicita moderar un avatar.";
const IONOS_PURPOSE =
  "El sistema envía correos de verificación, recuperación de contraseña y confirmación de contacto mediante SMTP de IONOS.";

export const PRIVACY_POLICY_REVISION_ID = PRIVACY_POLICY_REVISION;
export const PRIVACY_POLICY_URL = PROCESSOR_INVENTORY_POLICY_URL;

export const PUBLISHED_PROCESSOR_DISCLOSURES: ReadonlyMap<
  string,
  Omit<ProcessorDisclosure, "product">
> = new Map([
  [
    "openai",
    {
      providerId: "openai",
      displayName: "OpenAI",
      disclosureStatus: "published",
      purpose: OPENAI_PURPOSE,
      policyUrl: `${PROCESSOR_INVENTORY_POLICY_URL}#${PROVIDER_SECTION}`,
      declaredStatements: [
        "El código se conecta a la API global de OpenAI y no fija un endpoint regional europeo.",
        "La aplicación usa el endpoint global y no acredita una región de tratamiento determinada.",
        "La API puede usar subencargados.",
        "Según la documentación vigente de OpenAI, la API no usa por defecto las entradas y salidas para entrenar modelos.",
        "Los registros de supervisión de abuso pueden contener parte del contenido y conservarse hasta 30 días con la configuración estándar; puede haber excepciones legales o de seguridad.",
      ],
    },
  ],
  [
    "ionos-smtp",
    {
      providerId: "ionos-smtp",
      displayName: "IONOS",
      disclosureStatus: "published",
      purpose: IONOS_PURPOSE,
      policyUrl: `${PROCESSOR_INVENTORY_POLICY_URL}#${PROVIDER_SECTION}`,
      declaredStatements: [
        "Sus condiciones de tratamiento y las ubicaciones de almacenamiento o acceso dependen de la configuración y el contrato del servicio.",
      ],
    },
  ],
]);

export function applyProcessorDisclosure(
  providerId: string,
  displayName: string,
  product: string,
): ProcessorDisclosure {
  const disclosure = PUBLISHED_PROCESSOR_DISCLOSURES.get(providerId);
  if (!disclosure) {
    return {
      providerId,
      displayName,
      product,
      disclosureStatus: "missing",
    };
  }
  return { ...disclosure, product };
}
