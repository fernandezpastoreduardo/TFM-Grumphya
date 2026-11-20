# Contrato Beta D de señales privadas

Este documento es la fuente contractual de Grumphya para la etapa Beta D. La
integración conserva exactamente siete rutas GET y no añade ingesta externa:

    /audit/infrastructure
    /audit/deployment
    /audit/dependencies
    /audit/auth
    /audit/quality
    /audit/privacy
    /audit/ai

No se implementan POST, PUT ni PATCH. No existen rutas application ni ethics;
sus criterios viajan por deployment/dependencies y privacy. La auditoría
permanece con el valor vivo de AUDIT_ENABLED y este cambio no modifica
certificación pública ni certifiedReportId.

## Envoltura

La respuesta JSON tiene exactamente estas claves:

    {
      "schemaVersion": "beta-d-0.2",
      "observedAt": "2026-11-19T20:00:00.000Z",
      "validUntil": "2026-11-20T20:00:00.000Z",
      "environment": "production",
      "deploymentDigest": "sha256:<64 hex>",
      "cardinality": 1,
      "evidence": {
        "observedAt": "2026-11-19T20:00:00.000Z",
        "sampleRef": "sha256:<64 hex>",
        "signals": []
      },
      "attestation": {
        "alg": "EdDSA",
        "kid": "grumphya-release-2026",
        "signature": "<base64url>"
      }
    }

La firma EdDSA cubre la serialización canónica UTF-8 de todos los campos salvo
attestation. La canonicalización ordena las claves por valor Unicode
determinista, conserva el orden de los arrays y no añade espacios. sampleRef
es el SHA-256 de esa misma canonicalización aplicada únicamente a signals.
deploymentDigest debe identificar el artefacto realmente desplegado y
cardinality es siempre 1. La clave privada solo vive en
AUDIT_RELEASE_SIGNING_KEY.

## Señales

Cada señal tiene exactamente criterionId, status, reasonCode, value, unit y,
para count o milliseconds, limit. Los estados son pass, fail, unknown y
not_applicable; las unidades son boolean, count y milliseconds. unknown y
not_applicable exigen value=null.

Los criterios permitidos por ruta son:

| Ruta           | Criterios                                                                    |
| -------------- | ---------------------------------------------------------------------------- |
| infrastructure | infrastructure.tls, infrastructure.headers, infrastructure.network           |
| deployment     | application.secrets                                                          |
| dependencies   | application.dependencies                                                     |
| auth           | authentication.authorization                                                 |
| quality        | quality.e2e, quality.accessibility, performance.page_load                    |
| privacy        | privacy.cookies, privacy.third_parties, privacy.consent, ethics.transparency |
| ai             | ai.disclosure                                                                |

Los reasonCode y límites se validan contra la matriz implementada en
apps/api/src/audit/audit-signals.ts. Los límites de calidad son:

Matriz de reasonCode:

- infrastructure.tls: infrastructure_transport_verified,
  infrastructure_transport_incomplete, infrastructure_transport_not_applicable.
- infrastructure.headers: security_headers_verified, security_headers_missing,
  security_headers_unobserved.
- infrastructure.network: network_surface_allowlisted,
  network_surface_restricted, network_surface_unobserved.
- application.secrets: secrets_not_in_image, secrets_check_unavailable.
- application.dependencies: dependency_risk_not_observed,
  high_dependency_risk_observed, critical_dependency_risk_observed.
- authentication.authorization: technical_contract_verified,
  technical_contract_mismatch, authorization_flow_passed,
  authorization_flow_failed.
- quality.e2e: public_flow_loaded, report_flow_loaded, release_checks.
- quality.accessibility: accessibility_critical_violations.
- performance.page_load: response_time, first_contentful_paint,
  interaction_to_next_paint.
- privacy.cookies: nonessential_storage_before_consent,
  essential_storage_only_before_consent, raw_identifier_storage_observed.
- privacy.third_parties: third_party_request_count,
  known_tracker_request_count, external_ingest_enabled.
- privacy.consent: consent_choice_recorded, consent_state_respected.
- ethics.transparency: privacy_notice_present, privacy_notice_missing,
  privacy_notice_unobserved.
- ai.disclosure: ai_disclosure_present, ai_disclosure_missing,
  ai_disclosure_unobserved.

- accessibility_critical_violations: count, límite 0.
- response_time: milliseconds, límite 2500.
- first_contentful_paint: milliseconds, límite 1800.
- interaction_to_next_paint: milliseconds, límite 200.

Los contadores están limitados a 0..1000 y los milisegundos a 0..120000.
Se rechazan claves adicionales, criterios de otra ruta, pares de criterio y
razón duplicados, hashes incorrectos y valores fuera de rango. Una señal que
no pueda observarse de forma válida queda en unknown; nunca se convierte en
pass por ausencia de datos. No se incluyen HTML, cabeceras completas,
cookies, nombres de terceros, dominios, IP internas, topología, usuarios,
secretos, prompts, modelos, SBOM ni texto libre.

## Autorización y validación

El JWT EdDSA debe contener exactamente el sujeto sub=desarrolloseguro-audit,
además de iss, aud, domain, hostname, environment, scope, iat, exp, jti y kid
allowlisted. El TTL máximo es de cinco minutos y la tolerancia de reloj no
supera 60 segundos. Las rutas rechazan cookies, query strings, redirecciones y
métodos distintos de GET. La configuración ausente mantiene el cierre
fail-closed y devuelve JSON 404 resource_not_allowed.

La validación local cubre las siete rutas, autenticación, scopes, firma,
expiración, ACL, cardinalidad, hashes, duplicados, criterios cruzados, límites,
señales unknown, permisos PostgreSQL y el preflight de configuración.
Fixtures solo se usan en tests; nunca se publican como evidencia.
