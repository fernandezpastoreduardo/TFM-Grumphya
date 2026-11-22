export const PROCESSOR_INVENTORY_SCHEMA = "processor-inventory-v1" as const;
export const PROCESSOR_INVENTORY_HOSTNAME = "grumphya.com" as const;
export const PROCESSOR_INVENTORY_POLICY_URL =
  "https://grumphya.com/politica-de-privacidad" as const;
export const PROCESSOR_INVENTORY_KID = "grumphya-release-2026" as const;
export const PROCESSOR_INVENTORY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const PROCESSOR_INVENTORY_MAX_BYTES = 64 * 1024;
export const PROCESSOR_INVENTORY_MAX_PROVIDERS = 32;
export const PROCESSOR_INVENTORY_MAX_STATEMENTS = 10;
export const PROCESSOR_INVENTORY_MAX_NAME_LENGTH = 120;
export const PROCESSOR_INVENTORY_MAX_TEXT_LENGTH = 500;

export type ProcessorDisclosure = {
  providerId: string;
  displayName: string;
  product: string;
  disclosureStatus: "published" | "missing";
  purpose?: string;
  policyUrl?: string;
  declaredStatements?: string[];
};

export type ProcessorInventoryUnsigned = {
  schemaVersion: typeof PROCESSOR_INVENTORY_SCHEMA;
  observedAt: string;
  validUntil: string;
  environment: "production";
  hostname: typeof PROCESSOR_INVENTORY_HOSTNAME;
  deploymentDigest: string;
  inventoryStatus: "complete" | "incomplete";
  privacyPolicy: {
    url: string;
    revision: string;
  };
  processors: ProcessorDisclosure[];
};

export type ProcessorInventoryResponse = ProcessorInventoryUnsigned & {
  attestation: {
    alg: "EdDSA";
    kid: typeof PROCESSOR_INVENTORY_KID;
    signature: string;
  };
};

export type ProcessorInventorySourceResult = {
  inventoryStatus: "complete" | "incomplete";
  processors: ProcessorDisclosure[];
};
