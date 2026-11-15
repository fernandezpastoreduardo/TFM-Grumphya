export interface PublicSeoRoute {
  path: string;
  seo: { title: string; description: string };
}

export function addPublicSeoMetadata(
  html: string,
  route: PublicSeoRoute,
): string;
