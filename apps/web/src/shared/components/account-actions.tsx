type AccountActionsProps = {
  isAuthenticated: boolean | null;
  isSigningOut: boolean;
  onSignOut: () => void;
  variant: "home" | "site";
};

const BUTTON_TEXT = {
  ACCOUNT: "Mi cuenta",
  LOGIN: "Entrar",
  CREATE_ACCOUNT: "Crear cuenta",
  SIGN_OUT: "Cerrar sesión",
  SIGNING_OUT: "Cerrando sesión…",
} as const;

export function AccountActions({
  isAuthenticated,
  isSigningOut,
  onSignOut,
  variant,
}: AccountActionsProps) {
  if (isAuthenticated) {
    return (
      <div className={`account-actions account-actions-${variant}`}>
        <a className={getAccountLinkClass(variant)} href="/perfil">
          {BUTTON_TEXT.ACCOUNT}
        </a>
        <button
          className={getSignOutButtonClass(variant)}
          type="button"
          disabled={isSigningOut}
          onClick={onSignOut}
        >
          {isSigningOut ? BUTTON_TEXT.SIGNING_OUT : BUTTON_TEXT.SIGN_OUT}
        </button>
      </div>
    );
  }

  return (
    <div className={`account-actions account-actions-${variant}`}>
      <a className={getAccountLinkClass(variant)} href="/login">
        {BUTTON_TEXT.LOGIN}
      </a>
      <a className={getSignOutButtonClass(variant)} href="/precios">
        {BUTTON_TEXT.CREATE_ACCOUNT}
      </a>
    </div>
  );
}

function getAccountLinkClass(variant: "home" | "site"): string {
  return variant === "home" ? "home-login-button" : "site-account-link";
}

function getSignOutButtonClass(variant: "home" | "site"): string {
  return variant === "home"
    ? "home-register-button account-action-solid"
    : "site-account-solid";
}
