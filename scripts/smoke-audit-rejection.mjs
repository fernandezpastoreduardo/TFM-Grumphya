import assert from "node:assert/strict";

const BASE_URL = process.env.AUDIT_BASE_URL;
const ROUTE = process.env.AUDIT_REJECTION_ROUTE ?? "/audit/quality";
const EXPECTED_STATUS = Number(
  process.env.AUDIT_REJECTION_STATUS ??
    (process.env.AUDIT_ENABLED === "true" ? 401 : 404),
);
const EXPECTED_CODE =
  process.env.AUDIT_REJECTION_CODE ??
  (process.env.AUDIT_ENABLED === "true"
    ? "invalid_identity"
    : "resource_not_allowed");

if (!BASE_URL) throw new Error("AUDIT_BASE_URL es obligatorio.");

const invalidToken =
  "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCIsImtpZCI6ImRzLWF1ZGl0b3ItMjAyNiJ9.eyJzY29wZSI6ImF1ZGl0OnF1YWxpdHkifQ.invalid";
const response = await fetch(new URL(ROUTE, BASE_URL), {
  headers: {
    Accept: "application/json",
    Authorization: `Bearer ${invalidToken}`,
  },
  redirect: "manual",
});
const body = await response.json();

assert.equal(response.status, EXPECTED_STATUS);
assert.match(response.headers.get("content-type") ?? "", /application\/json/iu);
assert.equal(body.code, EXPECTED_CODE);
assert.equal(response.headers.has("location"), false);

console.log(
  JSON.stringify({
    event: "AUDIT_REJECTION_SMOKE",
    code: body.code,
    route: ROUTE.split("?", 1)[0],
    kid: "ds-auditor-2026",
  }),
);
