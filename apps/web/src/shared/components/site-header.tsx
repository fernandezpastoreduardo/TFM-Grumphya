import { createPortal } from "react-dom";
import { useRef, type RefObject } from "react";
import "./mobile-navigation.scss";
import "./shared-components.scss";
import { useNavigationOverflow } from "../hooks/use-navigation-overflow";
import type { Theme } from "../hooks/use-persistent-theme";
import { AccountActions } from "./account-actions";
import { SiteMobileMenuTrigger } from "./site-mobile-menu-trigger";
import { MobileSiteNavigation, SiteNavigation } from "./site-navigation";
import { SiteThemeToggle } from "./site-theme-toggle";

type SiteHeaderProps = {
  variant: "home" | "section";
  currentPath: string;
  theme: Theme;
  onThemeToggle: () => void;
  isMenuOpen: boolean;
  onMenuToggle: () => void;
  onMenuClose: () => void;
  menuTriggerRef: RefObject<HTMLButtonElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
  isAuthenticated: boolean | null;
  isAdmin: boolean;
  isSigningOut: boolean;
  avatarUrl: string | null;
  onSignOut: () => void;
};

function getHeaderClass(
  variant: SiteHeaderProps["variant"],
  hasOverflow: boolean,
) {
  const baseClass = variant === "home" ? "home-topbar" : "site-header";
  return `${baseClass}${hasOverflow ? " navigation-overflow" : ""}`;
}

function getMobileMenuClass(variant: SiteHeaderProps["variant"]) {
  return variant === "home" ? "home-mobile-menu" : "site-mobile-menu";
}

function getMenuId(variant: SiteHeaderProps["variant"]) {
  return variant === "home" ? "home-sections-menu" : "site-sections-menu";
}

function getAccountActionsVariant(variant: SiteHeaderProps["variant"]) {
  return variant === "home" ? "home" : "site";
}

function SiteBrand({ variant }: Pick<SiteHeaderProps, "variant">) {
  if (variant === "home") {
    return (
      <a className="home-brand" href="/" aria-label="Grumphya, inicio">
        Grumphya
      </a>
    );
  }
  return (
    <a className="site-brand" href="/" aria-label="Grumphya, inicio">
      <span className="brand-mark" aria-hidden="true" />
      <span>Grumphya</span>
    </a>
  );
}

function SiteHeaderActions({
  variant,
  isAuthenticated,
  avatarUrl,
  isSigningOut,
  onSignOut,
  theme,
  onThemeToggle,
  isMenuOpen,
  onMenuToggle,
  menuTriggerRef,
}: Pick<
  SiteHeaderProps,
  | "variant"
  | "isAuthenticated"
  | "avatarUrl"
  | "isSigningOut"
  | "onSignOut"
  | "theme"
  | "onThemeToggle"
  | "isMenuOpen"
  | "onMenuToggle"
  | "menuTriggerRef"
>) {
  const actions = (
    <>
      <AccountActions
        isAuthenticated={isAuthenticated}
        avatarUrl={avatarUrl}
        isSigningOut={isSigningOut}
        onSignOut={onSignOut}
        variant={getAccountActionsVariant(variant)}
      />
      <SiteThemeToggle
        theme={theme}
        variant={variant}
        onToggle={onThemeToggle}
      />
      <div className={getMobileMenuClass(variant)}>
        <SiteMobileMenuTrigger
          isOpen={isMenuOpen}
          menuId={getMenuId(variant)}
          triggerRef={menuTriggerRef}
          onToggle={onMenuToggle}
        />
      </div>
    </>
  );

  return variant === "home" ? (
    <div className="home-nav-actions">{actions}</div>
  ) : (
    actions
  );
}

export function SiteHeader({
  variant,
  currentPath,
  theme,
  onThemeToggle,
  isMenuOpen,
  onMenuToggle,
  onMenuClose,
  menuTriggerRef,
  menuRef,
  isAuthenticated,
  isAdmin,
  isSigningOut,
  avatarUrl,
  onSignOut,
}: SiteHeaderProps) {
  const headerRef = useRef<HTMLElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const hasNavigationOverflow = useNavigationOverflow(headerRef, navigationRef);
  const mobileMenuClass = getMobileMenuClass(variant);

  return (
    <>
      <header
        ref={headerRef}
        className={getHeaderClass(variant, hasNavigationOverflow)}
      >
        <SiteBrand variant={variant} />
        <SiteNavigation
          variant={variant}
          currentPath={currentPath}
          isAdmin={isAdmin}
          navigationRef={navigationRef}
        />
        <SiteHeaderActions
          variant={variant}
          isAuthenticated={isAuthenticated}
          avatarUrl={avatarUrl}
          isSigningOut={isSigningOut}
          onSignOut={onSignOut}
          theme={theme}
          onThemeToggle={onThemeToggle}
          isMenuOpen={isMenuOpen}
          onMenuToggle={onMenuToggle}
          menuTriggerRef={menuTriggerRef}
        />
      </header>
      {isMenuOpen
        ? createPortal(
            <>
              <button
                className="mobile-menu-backdrop"
                type="button"
                aria-hidden="true"
                tabIndex={-1}
                onClick={onMenuClose}
              />
              <div
                ref={menuRef}
                className={`${mobileMenuClass} mobile-menu-portal theme-${theme}${hasNavigationOverflow ? " navigation-overflow" : ""}`}
                role="dialog"
                aria-modal="true"
                aria-label="Menú de navegación"
              >
                <MobileSiteNavigation
                  variant={variant}
                  currentPath={currentPath}
                  isAdmin={isAdmin}
                  isAuthenticated={isAuthenticated}
                  avatarUrl={avatarUrl}
                  isSigningOut={isSigningOut}
                  onSignOut={onSignOut}
                />
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
