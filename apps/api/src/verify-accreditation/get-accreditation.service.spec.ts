import { describe, expect, it } from "vitest";
import {
  GetAccreditation,
  type AccreditationRecord,
} from "./get-accreditation.service";

const RECORD: AccreditationRecord = {
  id: "DS-GRUMPHYA-2026-001",
  issuer: "Desarrollo Seguro",
  application: "Grumphya",
  authorizedDomains: ["grumphya.com"],
  status: "demonstration",
  issuedAt: null,
  expiresAt: null,
  scope: "Prototipo académico",
  criteria: ["Seguridad de sesiones", "Privacidad"],
  disclaimer: "Demostración académica sin auditoría independiente.",
};
const NOW = new Date("2026-10-28T12:00:00.000Z");

function service(record: AccreditationRecord = RECORD) {
  return new GetAccreditation([record], () => NOW);
}

describe("GetAccreditation", () => {
  it("returns only the server-owned public Grumphya record", () => {
    const hidden = { ...RECORD, internalSecret: "never-public" };
    const result = service(hidden).execute(RECORD.id);

    expect(result).toEqual(RECORD);
    expect(JSON.stringify(result)).not.toContain("never-public");
    expect(result?.authorizedDomains).toEqual(["grumphya.com"]);
  });

  it.each([
    "unknown",
    "grumphya.com",
    "../DS-GRUMPHYA-2026-001",
    "DS-GRUMPHYA-2026-001%2f",
    "a".repeat(1024),
    null,
    123,
  ])("does not issue a record for invalid or unknown id %s", (id) => {
    expect(service().execute(id)).toBeNull();
  });

  it.each(["suspended", "revoked"] as const)(
    "preserves the non-valid %s state",
    (status) => {
      expect(service({ ...RECORD, status }).execute(RECORD.id)?.status).toBe(
        status,
      );
    },
  );

  it("marks an expired record as expired even if the stored state is demonstration", () => {
    const result = service({
      ...RECORD,
      expiresAt: "2026-10-28T11:59:59.000Z",
    }).execute(RECORD.id);

    expect(result?.status).toBe("expired");
  });

  it("does not override a revoked state when the date has passed", () => {
    const result = service({
      ...RECORD,
      status: "revoked",
      expiresAt: "2026-10-27T12:00:00.000Z",
    }).execute(RECORD.id);

    expect(result?.status).toBe("revoked");
  });

  it("does not present unrecognized or malformed internal state as valid", () => {
    expect(
      service({ ...RECORD, status: "active" }).execute(RECORD.id)?.status,
    ).toBe("unknown");
    expect(
      service({ ...RECORD, expiresAt: "invalid" }).execute(RECORD.id)?.status,
    ).toBe("unknown");
  });

  it("copies domains and criteria so a response cannot mutate the registry", () => {
    const first = service().execute(RECORD.id);
    first?.authorizedDomains.push("evil.example");
    first?.criteria.push("fake audit");

    expect(service().execute(RECORD.id)?.authorizedDomains).toEqual([
      "grumphya.com",
    ]);
    expect(service().execute(RECORD.id)?.criteria).toEqual(RECORD.criteria);
  });
});
