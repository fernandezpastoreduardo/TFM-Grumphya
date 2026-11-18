import { Inject, Injectable } from "@nestjs/common";
import { createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { auditError } from "./audit-errors";
import { assertAuditResponseSize } from "./audit-request-policy";
import {
  AUDIT_EVIDENCE_REPOSITORY,
  AUDIT_CLOCK,
  AUDIT_SCHEMA_VERSION,
  type AuditEnvelope,
  type AuditEvidenceRepository,
  type AuditResource,
  type ReleaseAttestationRecord,
} from "./audit.models";

const MAX_EVIDENCE_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_QUERY_TIME_MS = 5_000;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function readManifestPublicKey(
  environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const inline = environment.AUDIT_RELEASE_MANIFEST_PUBLIC_KEY?.trim();
  if (inline) return inline.replace(/\\n/gu, "\n");
  const file = environment.AUDIT_RELEASE_MANIFEST_PUBLIC_KEY_FILE?.trim();
  if (!file) return undefined;
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

function toIso(value: Date): string {
  return value.toISOString();
}

function validateFreshness(
  observedAt: Date,
  validUntil: Date,
  now: Date,
): void {
  if (
    validUntil.getTime() <= now.getTime() ||
    observedAt.getTime() > now.getTime() + 30_000
  ) {
    throw auditError(
      503,
      "evidence_unavailable",
      "La evidencia de auditoría ha caducado.",
    );
  }
  if (now.getTime() - observedAt.getTime() > MAX_EVIDENCE_AGE_MS) {
    throw auditError(
      503,
      "evidence_unavailable",
      "La evidencia de auditoría es demasiado antigua.",
    );
  }
}

function envelope(
  observedAt: Date,
  validUntil: Date,
  items: unknown[],
): AuditEnvelope {
  const result: AuditEnvelope = {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    observedAt: toIso(observedAt),
    validUntil: toIso(validUntil),
    items,
  };
  assertAuditResponseSize(result);
  return result;
}

function signedManifestIsValid(
  attestation: ReleaseAttestationRecord,
  now: Date,
): boolean {
  const publicKeyPem = readManifestPublicKey();
  if (!publicKeyPem) return false;
  try {
    const publicKey = createPublicKey(publicKeyPem);
    const signature = Buffer.from(attestation.signature, "base64url");
    return (
      verify(
        null,
        Buffer.from(stableJson(attestation.manifest)),
        publicKey,
        signature,
      ) &&
      attestation.manifest.schemaVersion === AUDIT_SCHEMA_VERSION &&
      attestation.manifest.environment === "production" &&
      typeof attestation.manifest.deployment === "object" &&
      attestation.manifest.deployment !== null &&
      typeof attestation.manifest.dependencies === "object" &&
      attestation.manifest.dependencies !== null &&
      attestation.validUntil.getTime() > now.getTime()
    );
  } catch {
    return false;
  }
}

@Injectable()
export class AuditService {
  constructor(
    @Inject(AUDIT_EVIDENCE_REPOSITORY)
    private readonly repository: AuditEvidenceRepository,
    @Inject(AUDIT_CLOCK)
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async read(resource: AuditResource): Promise<AuditEnvelope> {
    const now = this.clock();
    if (resource === "deployment" || resource === "dependencies") {
      return this.readAttested(resource, now);
    }
    const record = await this.withTimeout(
      this.repository.findLatestEvidence(resource),
    );
    if (!record) {
      throw auditError(
        503,
        "evidence_unavailable",
        "La evidencia de auditoría no está disponible.",
      );
    }
    validateFreshness(record.observedAt, record.validUntil, now);
    return envelope(record.observedAt, record.validUntil, record.items);
  }

  private async readAttested(
    resource: "deployment" | "dependencies",
    now: Date,
  ): Promise<AuditEnvelope> {
    const attestation = await this.withTimeout(
      this.repository.findLatestReleaseAttestation(),
    );
    if (!attestation || !signedManifestIsValid(attestation, now)) {
      throw auditError(
        503,
        "evidence_unavailable",
        "La atestación de release no está disponible.",
      );
    }
    validateFreshness(attestation.observedAt, attestation.validUntil, now);
    const item = attestation.manifest[resource];
    return envelope(attestation.observedAt, attestation.validUntil, [item]);
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            auditError(
              503,
              "evidence_unavailable",
              "La evidencia de auditoría no responde.",
            ),
          ),
        MAX_QUERY_TIME_MS,
      );
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
