import { Injectable } from "@nestjs/common";
import {
  createPrivateKey,
  createPublicKey,
  sign,
  type KeyObject,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { AuditHttpException, auditError } from "./audit-errors";
import { canonicalJson } from "./audit-signals";
import type { AuditTechnicalIdentity } from "./audit-technical-auth";
import { AuditService } from "./audit.service";
import { collectProcessorInventorySource } from "./processor-inventory-source";
import {
  PROCESSOR_INVENTORY_HOSTNAME,
  PROCESSOR_INVENTORY_KID,
  PROCESSOR_INVENTORY_MAX_AGE_MS,
  PROCESSOR_INVENTORY_MAX_BYTES,
  PROCESSOR_INVENTORY_MAX_NAME_LENGTH,
  PROCESSOR_INVENTORY_MAX_PROVIDERS,
  PROCESSOR_INVENTORY_MAX_STATEMENTS,
  PROCESSOR_INVENTORY_MAX_TEXT_LENGTH,
  PROCESSOR_INVENTORY_SCHEMA,
  type ProcessorDisclosure,
  type ProcessorInventoryResponse,
  type ProcessorInventorySourceResult,
  type ProcessorInventoryUnsigned,
} from "./processor-inventory.models";
import {
  PRIVACY_POLICY_REVISION_ID,
  PRIVACY_POLICY_URL,
} from "./processor-inventory-policy";

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const SIGNING_PRIVATE_KEY_FILE_ENV = "AUDIT_RELEASE_SIGNING_PRIVATE_KEY_FILE";
const SIGNING_PRIVATE_KEY_ENV = "AUDIT_RELEASE_SIGNING_PRIVATE_KEY";
const ALLOWED_KIDS_ENV = "AUDIT_RELEASE_MANIFEST_ALLOWED_KIDS";
const PUBLIC_KEY_ENV = "AUDIT_RELEASE_MANIFEST_PUBLIC_KEY";
const PUBLIC_KEY_FILE_ENV = "AUDIT_RELEASE_MANIFEST_PUBLIC_KEY_FILE";
const REQUIRED_SCOPE = "audit:privacy";
const MAX_QUERY_TIME_MS = 5_000;
const INVENTORY_KEYS = [
  "schemaVersion",
  "observedAt",
  "validUntil",
  "environment",
  "hostname",
  "deploymentDigest",
  "inventoryStatus",
  "privacyPolicy",
  "processors",
  "attestation",
] as const;
const PRIVACY_POLICY_KEYS = ["url", "revision"] as const;
const PUBLISHED_PROCESSOR_KEYS = [
  "providerId",
  "displayName",
  "product",
  "disclosureStatus",
  "purpose",
  "policyUrl",
  "declaredStatements",
] as const;
const MISSING_PROCESSOR_KEYS = [
  "providerId",
  "displayName",
  "product",
  "disclosureStatus",
] as const;
const SIGNATURE_KEYS = ["alg", "kid", "signature"] as const;
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const PROVIDER_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

type InventoryClock = () => Date;
type InventorySource = () => ProcessorInventorySourceResult;
type SigningKeyReader = () => {
  privateKey: KeyObject;
  publicKey: KeyObject;
};

function exactKeys(value: unknown, keys: readonly string[]): boolean {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validBoundedString(value: unknown, max: number): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= max
  );
}

function isIsoInstant(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_INSTANT_PATTERN.test(value))
    return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function validProcessor(value: unknown): value is ProcessorDisclosure {
  if (!isRecord(value)) return false;
  if (
    typeof value.providerId !== "string" ||
    !PROVIDER_ID_PATTERN.test(value.providerId) ||
    !validBoundedString(
      value.displayName,
      PROCESSOR_INVENTORY_MAX_NAME_LENGTH,
    ) ||
    !validBoundedString(value.product, PROCESSOR_INVENTORY_MAX_NAME_LENGTH)
  )
    return false;
  if (value.disclosureStatus === "missing")
    return exactKeys(value, MISSING_PROCESSOR_KEYS);
  if (
    value.disclosureStatus !== "published" ||
    !exactKeys(value, PUBLISHED_PROCESSOR_KEYS) ||
    !validBoundedString(value.purpose, PROCESSOR_INVENTORY_MAX_TEXT_LENGTH) ||
    typeof value.policyUrl !== "string" ||
    !value.policyUrl.startsWith(`${PRIVACY_POLICY_URL}#`) ||
    !Array.isArray(value.declaredStatements) ||
    value.declaredStatements.length > PROCESSOR_INVENTORY_MAX_STATEMENTS ||
    value.declaredStatements.some(
      (statement) =>
        !validBoundedString(statement, PROCESSOR_INVENTORY_MAX_TEXT_LENGTH),
    ) ||
    new Set(value.declaredStatements).size !== value.declaredStatements.length
  )
    return false;
  return true;
}

export function assertProcessorInventory(
  value: unknown,
  now: Date,
): asserts value is ProcessorInventoryUnsigned {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "schemaVersion",
      "observedAt",
      "validUntil",
      "environment",
      "hostname",
      "deploymentDigest",
      "inventoryStatus",
      "privacyPolicy",
      "processors",
    ]) ||
    value.schemaVersion !== PROCESSOR_INVENTORY_SCHEMA ||
    value.environment !== "production" ||
    value.hostname !== PROCESSOR_INVENTORY_HOSTNAME ||
    typeof value.deploymentDigest !== "string" ||
    !DIGEST_PATTERN.test(value.deploymentDigest) ||
    (value.inventoryStatus !== "complete" &&
      value.inventoryStatus !== "incomplete") ||
    !isRecord(value.privacyPolicy) ||
    !exactKeys(value.privacyPolicy, PRIVACY_POLICY_KEYS) ||
    value.privacyPolicy.url !== PRIVACY_POLICY_URL ||
    value.privacyPolicy.revision !== PRIVACY_POLICY_REVISION_ID ||
    !Array.isArray(value.processors) ||
    value.processors.length > PROCESSOR_INVENTORY_MAX_PROVIDERS ||
    value.processors.some((processor) => !validProcessor(processor))
  ) {
    throw auditError(
      503,
      "evidence_unavailable",
      "El inventario de proveedores no cumple el contrato.",
    );
  }

  const ids = value.processors.map((processor) => processor.providerId);
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id, index) => index > 0 && ids[index - 1] >= id)
  ) {
    throw auditError(
      503,
      "evidence_unavailable",
      "El inventario de proveedores no cumple el contrato.",
    );
  }

  if (!isIsoInstant(value.observedAt) || !isIsoInstant(value.validUntil))
    throw auditError(
      503,
      "evidence_unavailable",
      "Las fechas del inventario no son válidas.",
    );
  const observedAt = Date.parse(value.observedAt);
  const validUntil = Date.parse(value.validUntil);
  const nowTime = now.getTime();
  if (
    observedAt > nowTime ||
    validUntil <= nowTime ||
    validUntil <= observedAt ||
    validUntil - observedAt > PROCESSOR_INVENTORY_MAX_AGE_MS
  ) {
    throw auditError(
      503,
      "evidence_unavailable",
      "Las fechas del inventario no son válidas.",
    );
  }
}

function readPrivateKey(environment: NodeJS.ProcessEnv = process.env): {
  privateKey: KeyObject;
  publicKey: KeyObject;
} {
  const path = environment[SIGNING_PRIVATE_KEY_FILE_ENV]?.trim();
  const inline = environment[SIGNING_PRIVATE_KEY_ENV]?.trim();
  let privatePem: string;
  try {
    privatePem = path
      ? readFileSync(path, "utf8")
      : (inline?.replace(/\\n/gu, "\n") ?? "");
  } catch {
    throw auditError(
      503,
      "evidence_unavailable",
      "La firma del inventario no está disponible.",
    );
  }
  if (!privatePem)
    throw auditError(
      503,
      "evidence_unavailable",
      "La firma del inventario no está disponible.",
    );

  const allowedKids = (environment[ALLOWED_KIDS_ENV] ?? "")
    .split(",")
    .map((kid) => kid.trim())
    .filter(Boolean);
  if (!allowedKids.includes(PROCESSOR_INVENTORY_KID))
    throw auditError(
      503,
      "evidence_unavailable",
      "La firma del inventario no está disponible.",
    );

  try {
    const privateKey = createPrivateKey(privatePem);
    const publicKey = createPublicKey(privateKey);
    const configuredPublicKey = readConfiguredPublicKey(environment);
    const configuredPublicKeyObject = configuredPublicKey
      ? createPublicKey(configuredPublicKey)
      : undefined;
    if (
      privateKey.asymmetricKeyType !== "ed25519" ||
      !configuredPublicKeyObject ||
      configuredPublicKeyObject.asymmetricKeyType !== "ed25519" ||
      publicKey.export({ type: "spki", format: "der" }).toString("hex") !==
        configuredPublicKeyObject
          .export({ type: "spki", format: "der" })
          .toString("hex")
    ) {
      throw new Error("Signing key mismatch.");
    }
    return { privateKey, publicKey };
  } catch {
    throw auditError(
      503,
      "evidence_unavailable",
      "La firma del inventario no está disponible.",
    );
  }
}

function readConfiguredPublicKey(
  environment: NodeJS.ProcessEnv,
): string | undefined {
  const inline = environment[PUBLIC_KEY_ENV]?.trim();
  if (inline) return inline.replace(/\\n/gu, "\n");
  const path = environment[PUBLIC_KEY_FILE_ENV]?.trim();
  if (!path) return undefined;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

function assertIdentity(identity: AuditTechnicalIdentity): void {
  if (
    identity.issuer !== "desarrolloseguro-audit" ||
    identity.subject !== "desarrolloseguro-audit" ||
    identity.audience !== "grumphya-audit" ||
    identity.environment !== "production" ||
    identity.domain !== PROCESSOR_INVENTORY_HOSTNAME ||
    identity.hostname !== PROCESSOR_INVENTORY_HOSTNAME ||
    !identity.scopes.has(REQUIRED_SCOPE)
  ) {
    throw auditError(
      403,
      "insufficient_scope",
      "Identidad técnica no autorizada.",
    );
  }
}

function buildUnsignedInventory(
  source: ProcessorInventorySourceResult,
  deploymentDigest: string,
  now: Date,
): ProcessorInventoryUnsigned {
  const observedAt = now.toISOString();
  const validUntil = new Date(
    now.getTime() + PROCESSOR_INVENTORY_MAX_AGE_MS,
  ).toISOString();
  const unsigned: ProcessorInventoryUnsigned = {
    schemaVersion: PROCESSOR_INVENTORY_SCHEMA,
    observedAt,
    validUntil,
    environment: "production",
    hostname: PROCESSOR_INVENTORY_HOSTNAME,
    deploymentDigest,
    inventoryStatus: source.inventoryStatus,
    privacyPolicy: {
      url: PRIVACY_POLICY_URL,
      revision: PRIVACY_POLICY_REVISION_ID,
    },
    processors: source.processors,
  };
  assertProcessorInventory(unsigned, now);
  return unsigned;
}

function assertSignedSize(value: ProcessorInventoryResponse): void {
  if (
    Buffer.byteLength(JSON.stringify(value), "utf8") >
    PROCESSOR_INVENTORY_MAX_BYTES
  )
    throw auditError(
      413,
      "response_too_large",
      "El inventario supera el tamaño permitido.",
    );
}

@Injectable()
export class ProcessorInventoryService {
  constructor(
    private readonly releases: AuditService,
    private readonly clock: InventoryClock = () => new Date(),
    private readonly source: InventorySource = collectProcessorInventorySource,
    private readonly signingKeyReader: SigningKeyReader = readPrivateKey,
  ) {}

  async read(
    identity: AuditTechnicalIdentity,
  ): Promise<ProcessorInventoryResponse> {
    assertIdentity(identity);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const digest = await Promise.race([
        this.releases.readCurrentReleaseDigest(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Release inventory timeout.")),
            MAX_QUERY_TIME_MS,
          );
        }),
      ]);
      const now = this.clock();
      if (!DIGEST_PATTERN.test(digest))
        throw auditError(
          503,
          "evidence_unavailable",
          "El release activo no está validado.",
        );
      const unsigned = buildUnsignedInventory(this.source(), digest, now);
      const signing = this.signingKeyReader();
      const signature = sign(
        null,
        Buffer.from(canonicalJson(unsigned), "utf8"),
        signing.privateKey,
      ).toString("base64url");
      const response: ProcessorInventoryResponse = {
        ...unsigned,
        attestation: {
          alg: "EdDSA",
          kid: PROCESSOR_INVENTORY_KID,
          signature,
        },
      };
      if (
        !exactKeys(response, INVENTORY_KEYS) ||
        !exactKeys(response.attestation, SIGNATURE_KEYS) ||
        response.attestation.alg !== "EdDSA" ||
        response.attestation.kid !== PROCESSOR_INVENTORY_KID ||
        signing.publicKey.asymmetricKeyType !== "ed25519" ||
        !/^[A-Za-z0-9_-]+$/u.test(signature)
      )
        throw auditError(
          503,
          "evidence_unavailable",
          "La firma del inventario no es válida.",
        );
      assertSignedSize(response);
      return response;
    } catch (error) {
      if (error instanceof AuditHttpException) throw error;
      throw auditError(
        503,
        "evidence_unavailable",
        "El inventario de proveedores no está disponible.",
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
