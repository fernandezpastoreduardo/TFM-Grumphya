export const LOGIN_ENDPOINT = "/api/auth/login";
export const LOGIN_ERROR =
  "No se ha podido iniciar sesión. Revisa los datos e inténtalo de nuevo.";
export const LOGIN_CHALLENGE_NOTICE = "Verificando el navegador…";
export const LOGIN_CHALLENGE_REQUIRED = "LOGIN_CHALLENGE_REQUIRED";
export const LOGIN_CHALLENGE_HEADER = "X-Login-Challenge";
export const LOGIN_PROOF_HEADER = "X-Login-Proof";
export const PASSWORD_VISIBILITY_LABEL = {
  SHOW: "Mostrar contraseña",
  HIDE: "Ocultar contraseña",
} as const;
