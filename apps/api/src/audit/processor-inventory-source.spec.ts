import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  readBackendProcessorRegistry,
  recordBackendProcessorRegistration,
  resetBackendProcessorRegistryForTests,
} from "../infrastructure/observability/backend-processors-registry";
import { PUBLISHED_PROCESSOR_DISCLOSURES } from "./processor-inventory-policy";
import { collectProcessorInventorySource } from "./processor-inventory-source";

const POLICY_SOURCE = readFileSync(
  resolve(
    process.cwd(),
    "../web/src/features/register-with-plan/privacy-policy.tsx",
  ),
  "utf8",
).replace(/\s+/gu, " ");

function productForRegistration(registrationId: string): string {
  if (registrationId === "openai-embedding") return "Embeddings API";
  if (registrationId === "openai-avatar-moderation") return "Moderations API";
  return "Responses API";
}

describe("processor inventory source", () => {
  it("marks an unregistered backend integration as incomplete", () => {
    resetBackendProcessorRegistryForTests();
    expect(readBackendProcessorRegistry().inventoryStatus).toBe("incomplete");
  });

  it("detects only the active backend adapters and reports their products", () => {
    resetBackendProcessorRegistryForTests();
    for (const registrationId of [
      "openai-evaluation",
      "openai-roast",
      "openai-embedding",
      "openai-idea-fingerprint",
      "openai-idea-equivalence",
      "openai-avatar-moderation",
    ] as const) {
      recordBackendProcessorRegistration(registrationId, {
        providerId: "openai",
        displayName: "OpenAI",
        product: productForRegistration(registrationId),
      });
    }
    recordBackendProcessorRegistration("smtp-mail", {
      providerId: "ionos-smtp",
      displayName: "IONOS",
      product: "SMTP de IONOS",
    });
    const inventory = collectProcessorInventorySource();

    expect(inventory).toEqual({
      inventoryStatus: "complete",
      processors: [
        {
          providerId: "ionos-smtp",
          displayName: "IONOS",
          product: "SMTP de IONOS",
          disclosureStatus: "published",
          purpose:
            "El sistema envía correos de verificación, recuperación de contraseña y confirmación de contacto mediante SMTP de IONOS.",
          policyUrl:
            "https://grumphya.com/politica-de-privacidad#privacy-providers-title",
          declaredStatements: [
            "Sus condiciones de tratamiento y las ubicaciones de almacenamiento o acceso dependen de la configuración y el contrato del servicio.",
          ],
        },
        {
          providerId: "openai",
          displayName: "OpenAI",
          product: "Embeddings API, Moderations API, Responses API",
          disclosureStatus: "published",
          purpose: expect.any(String),
          policyUrl:
            "https://grumphya.com/politica-de-privacidad#privacy-providers-title",
          declaredStatements: expect.any(Array),
        },
      ],
    });
  });

  it("excludes disabled providers and marks unidentified active SMTP coverage incomplete", () => {
    resetBackendProcessorRegistryForTests();
    for (const registrationId of [
      "openai-evaluation",
      "openai-roast",
      "openai-embedding",
      "openai-idea-fingerprint",
      "openai-idea-equivalence",
      "openai-avatar-moderation",
    ] as const)
      recordBackendProcessorRegistration(registrationId, null);
    recordBackendProcessorRegistration("smtp-mail", {
      providerId: "ionos-smtp",
      displayName: "IONOS",
      product: "SMTP de IONOS",
    });
    const disabled = collectProcessorInventorySource();
    expect(disabled.processors.map(({ providerId }) => providerId)).toEqual([
      "ionos-smtp",
    ]);

    recordBackendProcessorRegistration("smtp-mail", {
      providerId: "smtp-unidentified",
      displayName: "Proveedor SMTP no identificado",
      product: "SMTP",
    });
    const unrecognizedMailProvider = collectProcessorInventorySource();
    expect(unrecognizedMailProvider.inventoryStatus).toBe("incomplete");
    expect(unrecognizedMailProvider.processors).toContainEqual({
      providerId: "smtp-unidentified",
      displayName: "Proveedor SMTP no identificado",
      product: "SMTP",
      disclosureStatus: "missing",
    });
  });

  it("distinguishes a complete empty registry from a missing registration", () => {
    resetBackendProcessorRegistryForTests();
    for (const registrationId of [
      "openai-evaluation",
      "openai-roast",
      "openai-embedding",
      "openai-idea-fingerprint",
      "openai-idea-equivalence",
      "openai-avatar-moderation",
    ] as const)
      recordBackendProcessorRegistration(registrationId, null);
    recordBackendProcessorRegistration("smtp-mail", null);

    expect(collectProcessorInventorySource()).toEqual({
      inventoryStatus: "complete",
      processors: [],
    });
    resetBackendProcessorRegistryForTests();
    expect(collectProcessorInventorySource()).toEqual({
      inventoryStatus: "incomplete",
      processors: [],
    });
  });

  it("keeps published processor purposes and statements in the public policy", () => {
    expect(POLICY_SOURCE).toContain('id="privacy-providers-title"');
    for (const disclosure of PUBLISHED_PROCESSOR_DISCLOSURES.values()) {
      expect(POLICY_SOURCE).toContain(disclosure.purpose);
      for (const statement of disclosure.declaredStatements ?? [])
        expect(POLICY_SOURCE).toContain(statement);
    }
    expect(POLICY_SOURCE).toContain("Versión 8");
  });
});
