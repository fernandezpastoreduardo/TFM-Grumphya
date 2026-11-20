import { describe, expect, it } from "vitest";
import {
  AUDIT_CRITERIA_BY_RESOURCE,
  canonicalJson,
  parseAuditEvidence,
  sampleRefForSignals,
  type AuditSignal,
} from "./audit-signals";

function evidence(
  resource: keyof typeof AUDIT_CRITERIA_BY_RESOURCE,
  signals: AuditSignal[],
) {
  return {
    observedAt: "2026-11-19T11:00:00.000Z",
    sampleRef: sampleRefForSignals(signals),
    signals,
  };
}
const UNKNOWN_REASON: Record<string, string> = {
  "infrastructure.tls": "infrastructure_transport_incomplete",
  "infrastructure.headers": "security_headers_unobserved",
  "infrastructure.network": "network_surface_unobserved",
  "application.secrets": "secrets_check_unavailable",
  "application.dependencies": "dependency_risk_not_observed",
  "authentication.authorization": "authorization_flow_failed",
  "quality.e2e": "release_checks",
  "quality.accessibility": "accessibility_critical_violations",
  "performance.page_load": "response_time",
  "privacy.cookies": "essential_storage_only_before_consent",
  "privacy.third_parties": "third_party_request_count",
  "privacy.consent": "consent_choice_recorded",
  "ethics.transparency": "privacy_notice_unobserved",
  "ai.disclosure": "ai_disclosure_unobserved",
};
const UNKNOWN_UNIT: Record<string, "boolean" | "count" | "milliseconds"> = {
  "application.dependencies": "count",
  "privacy.third_parties": "count",
  "quality.accessibility": "count",
  "performance.page_load": "milliseconds",
};
function unknownLimit(
  criterionId: string,
  unit: "boolean" | "count" | "milliseconds",
): number | undefined {
  if (unit === "count")
    return criterionId === "quality.accessibility" ? 0 : 1000;
  if (unit === "milliseconds") return 2500;
  return undefined;
}
describe("Beta D signal contract", () => {
  it("uses deterministic Unicode-key canonicalization and hashes only signals", () => {
    expect(canonicalJson({ z: 1, a: { ñ: true, a: false } })).toBe(
      '{"a":{"a":false,"ñ":true},"z":1}',
    );
    const signals: AuditSignal[] = [
      {
        criterionId: "quality.accessibility",
        status: "unknown",
        reasonCode: "accessibility_critical_violations",
        value: null,
        unit: "count",
        limit: 0,
      },
    ];
    expect(
      parseAuditEvidence(evidence("quality", signals), "quality").sampleRef,
    ).toBe(sampleRefForSignals(signals));
  });
  it("accepts unknown null values and exact quality limits", () => {
    const signals: AuditSignal[] = [
      {
        criterionId: "quality.accessibility",
        status: "unknown",
        reasonCode: "accessibility_critical_violations",
        value: null,
        unit: "count",
        limit: 0,
      },
      {
        criterionId: "performance.page_load",
        status: "unknown",
        reasonCode: "response_time",
        value: null,
        unit: "milliseconds",
        limit: 2500,
      },
    ];
    expect(
      parseAuditEvidence(evidence("quality", signals), "quality").signals,
    ).toEqual(signals);
  });
  it("accepts an unknown signal for every allowlisted route criterion", () => {
    for (const [resource, criteria] of Object.entries(
      AUDIT_CRITERIA_BY_RESOURCE,
    )) {
      for (const criterionId of criteria) {
        const reasonCode = UNKNOWN_REASON[criterionId];
        const unit = UNKNOWN_UNIT[criterionId] ?? "boolean";
        const limit = unknownLimit(criterionId, unit);
        const signal = {
          criterionId,
          status: "unknown" as const,
          reasonCode,
          value: null,
          unit,
          ...(limit === undefined ? {} : { limit }),
        };
        const parsed = parseAuditEvidence(
          evidence(resource as keyof typeof AUDIT_CRITERIA_BY_RESOURCE, [
            signal,
          ]),
          resource as keyof typeof AUDIT_CRITERIA_BY_RESOURCE,
        );
        expect(parsed.signals).toHaveLength(1);
      }
    }
  });
  it("accepts measured allowlisted third-party origin signals", () => {
    const signals: AuditSignal[] = [
      {
        criterionId: "privacy.third_parties",
        status: "pass",
        reasonCode: "third_party_origin_count",
        value: 1,
        unit: "count",
        limit: 1,
      },
      {
        criterionId: "privacy.third_parties",
        status: "pass",
        reasonCode: "third_party_origins_allowlisted",
        value: 1,
        unit: "boolean",
      },
    ];
    expect(
      parseAuditEvidence(evidence("privacy", signals), "privacy").signals,
    ).toEqual(signals);
  });
  it.each([
    [
      "duplicate criterion",
      [
        {
          criterionId: "infrastructure.tls",
          status: "unknown",
          reasonCode: "infrastructure_transport_incomplete",
          value: null,
          unit: "boolean",
        },
        {
          criterionId: "infrastructure.tls",
          status: "unknown",
          reasonCode: "infrastructure_transport_incomplete",
          value: null,
          unit: "boolean",
        },
      ],
    ],
    [
      "cross-route criterion",
      [
        {
          criterionId: "ai.disclosure",
          status: "unknown",
          reasonCode: "ai_disclosure_unobserved",
          value: null,
          unit: "boolean",
        },
      ],
    ],
    [
      "wrong unknown value",
      [
        {
          criterionId: "quality.e2e",
          status: "unknown",
          reasonCode: "release_checks",
          value: 0,
          unit: "boolean",
        },
      ],
    ],
    [
      "out of range",
      [
        {
          criterionId: "quality.accessibility",
          status: "pass",
          reasonCode: "accessibility_critical_violations",
          value: 1,
          unit: "count",
          limit: 0,
        },
      ],
    ],
  ])("rejects %s", (_name, signals) => {
    expect(() =>
      parseAuditEvidence(
        evidence("infrastructure", signals as AuditSignal[]),
        "infrastructure",
      ),
    ).toThrow();
  });
  it("rejects extra keys and an incorrect sample hash", () => {
    const signal: AuditSignal = {
      criterionId: "infrastructure.tls",
      status: "pass",
      reasonCode: "infrastructure_transport_verified",
      value: 1,
      unit: "boolean",
    };
    expect(() =>
      parseAuditEvidence(
        { ...evidence("infrastructure", [signal]), extra: true },
        "infrastructure",
      ),
    ).toThrow();
    expect(() =>
      parseAuditEvidence(
        {
          ...evidence("infrastructure", [signal]),
          sampleRef: "sha256:" + "0".repeat(64),
        },
        "infrastructure",
      ),
    ).toThrow();
  });
});
