import type { SectionPageDefinition } from "./section-page-definition";
import { ACCREDITATION_VERIFICATION_PAGE } from "./accreditation-verification";
import { ADMIN_DASHBOARD_PAGES } from "./admin-dashboard";
import { AUTHENTICATION_PAGES } from "./authentication";
import { CONTACT_PAGES } from "./contact";
import { GOOD_PRACTICES_PAGES } from "./good-practices";
import { NOTABLE_HUMANS_PAGES } from "./notable-humans";
import { PASSWORD_RESET_PAGES } from "./password-reset";
import { PRICING_PAGES } from "./pricing";
import { PROFILE_PAGES } from "./profile";
import { REGISTRATION_PAGES } from "./registration";
import { ROAST_PAGES } from "./roast";
import { WORST_IDEAS_PAGES } from "./worst-ideas";

export const SECTION_PAGES: Record<string, SectionPageDefinition> = {
  ...ACCREDITATION_VERIFICATION_PAGE,
  ...WORST_IDEAS_PAGES,
  ...ROAST_PAGES,
  ...NOTABLE_HUMANS_PAGES,
  ...GOOD_PRACTICES_PAGES,
  ...PRICING_PAGES,
  ...CONTACT_PAGES,
  ...AUTHENTICATION_PAGES,
  ...REGISTRATION_PAGES,
  ...PROFILE_PAGES,
  ...ADMIN_DASHBOARD_PAGES,
  ...PASSWORD_RESET_PAGES,
};
