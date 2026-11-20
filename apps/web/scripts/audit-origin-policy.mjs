const ALLOWED_THIRD_PARTY_ORIGINS = new Set(["https://desarrolloseguro.org"]);

export function isAllowedThirdPartyOrigin(origin) {
  return ALLOWED_THIRD_PARTY_ORIGINS.has(origin);
}
