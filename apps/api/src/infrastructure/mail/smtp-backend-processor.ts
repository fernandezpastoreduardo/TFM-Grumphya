import type { BackendProcessorRegistration } from "../observability/backend-processors-registry";

const IONOS_SMTP_HOSTS = new Set(["smtp.ionos.es", "smtp.ionos.com"]);
const MAX_HOST_LENGTH = 253;

function normalizedHost(host: string): string | undefined {
  const value = host.trim().toLowerCase().replace(/\.$/u, "");
  if (
    value.length > MAX_HOST_LENGTH ||
    !/^[a-z0-9.-]+$/u.test(value) ||
    value.includes("..")
  )
    return undefined;
  return value;
}

export function smtpBackendProcessor(
  configuredHost: string,
): BackendProcessorRegistration {
  const host = normalizedHost(configuredHost);
  if (host && IONOS_SMTP_HOSTS.has(host)) {
    return {
      providerId: "ionos-smtp",
      displayName: "IONOS",
      product: "SMTP de IONOS",
    };
  }
  return {
    providerId: "smtp-unidentified",
    displayName: "Proveedor SMTP no identificado",
    product: "SMTP",
  };
}
