import type { Ref } from "react";
import { AccountActions } from "./account-actions";
import {
  getSiteSectionLinks,
  isCurrentSiteSectionPath,
  type SiteNavigationVariant,
} from "../navigation/site-navigation.constants";

type SiteNavigationProps = {
  variant: SiteNavigationVariant;
  currentPath: string;
  isAdmin: boolean;
  navigationRef: Ref<HTMLElement>;
  isAuthenticated: boolean | null;
  avatarUrl: string | null;
  isSigningOut: boolean;
  onSignOut: () => void;
};

function getDesktopNavigationClass(variant: SiteNavigationVariant) {
  return variant === "home" ? "home-nav-links" : "site-nav";
}

function getDesktopNavigationLabel(variant: SiteNavigationVariant) {
  return variant === "home" ? "Secciones principales" : "Navegación principal";
}

function getDesktopLinkClass(
  variant: SiteNavigationVariant,
  isHomeLink: boolean,
) {
  if (variant === "home") {
    return isHomeLink ? "home-nav-link is-current" : "home-nav-link";
  }
  return isHomeLink ? "site-nav-home" : undefined;
}

function getLinkCurrentPath(
  variant: SiteNavigationVariant,
  path: string,
  currentPath: string,
) {
  if (variant === "home") return path === "/" ? "page" : undefined;
  return isCurrentSiteSectionPath(path, currentPath) ? "page" : undefined;
}

function getAccountActionsVariant(variant: SiteNavigationVariant) {
  return variant === "home" ? "home" : "site";
}

function SiteNavigationLinks({
  variant,
  currentPath,
  isAdmin,
  desktop,
}: Pick<SiteNavigationProps, "variant" | "currentPath" | "isAdmin"> & {
  desktop: boolean;
}) {
  const sectionLinks = getSiteSectionLinks(isAdmin);
  const homeLinkClass = desktop
    ? getDesktopLinkClass(variant, true)
    : undefined;
  return (
    <>
      <a
        href="/"
        className={homeLinkClass}
        aria-current={getLinkCurrentPath(variant, "/", currentPath)}
      >
        Inicio
      </a>
      {sectionLinks.map((section) => (
        <a
          className={desktop ? getDesktopLinkClass(variant, false) : undefined}
          href={section.path}
          key={section.path}
          aria-current={getLinkCurrentPath(variant, section.path, currentPath)}
        >
          {section.label}
        </a>
      ))}
    </>
  );
}

export function SiteNavigation({
  variant,
  currentPath,
  isAdmin,
  navigationRef,
}: Pick<
  SiteNavigationProps,
  "variant" | "currentPath" | "isAdmin" | "navigationRef"
>) {
  return (
    <nav
      ref={navigationRef}
      className={getDesktopNavigationClass(variant)}
      aria-label={getDesktopNavigationLabel(variant)}
    >
      <SiteNavigationLinks
        variant={variant}
        currentPath={currentPath}
        isAdmin={isAdmin}
        desktop
      />
    </nav>
  );
}

export function MobileSiteNavigation({
  variant,
  currentPath,
  isAdmin,
  isAuthenticated,
  avatarUrl,
  isSigningOut,
  onSignOut,
}: Omit<SiteNavigationProps, "navigationRef">) {
  return (
    <nav
      id={variant === "home" ? "home-sections-menu" : "site-sections-menu"}
      aria-label="Secciones principales"
    >
      <SiteNavigationLinks
        variant={variant}
        currentPath={currentPath}
        isAdmin={isAdmin}
        desktop={false}
      />
      <AccountActions
        isAuthenticated={isAuthenticated}
        avatarUrl={avatarUrl}
        isSigningOut={isSigningOut}
        onSignOut={onSignOut}
        variant={getAccountActionsVariant(variant)}
      />
    </nav>
  );
}
