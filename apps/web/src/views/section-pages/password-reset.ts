import type { SectionPageDefinition } from "./section-page-definition";

const loadPasswordResetPage = () =>
  import("../../features/password-reset/password-reset").then((module) => ({
    default: module.PasswordReset,
  }));

export const PASSWORD_RESET_PAGES: Record<string, SectionPageDefinition> = {
  "/recuperar-contrasena": {
    meta: {
      title: "¿La contraseña se ha ido de paseo?",
      intro:
        "Solicita un enlace de un solo uso. No confirmaremos si existe una cuenta con ese correo.",
      theme: "mint",
      mascot: "login",
    },
    load: loadPasswordResetPage,
  },
  "/restablecer-contrasena": {
    meta: {
      title: "Una contraseña nueva",
      intro: "El enlace caduca pronto y solo se puede usar una vez.",
      theme: "mint",
      mascot: "login",
    },
    load: loadPasswordResetPage,
  },
};
