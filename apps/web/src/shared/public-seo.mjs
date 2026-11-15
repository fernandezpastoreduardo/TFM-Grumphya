const SITE_ORIGIN = "https://grumphya.com";
const SITE_NAME = "Grumphya";
const SOCIAL_IMAGE = `${SITE_ORIGIN}/assets/grumphya/home-grumpy-judge.webp`;

function escapeHtmlAttribute(value) {
  return value.replace(/[&"<>]/g, (character) => {
    const entities = { "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" };
    return entities[character];
  });
}

export function addPublicSeoMetadata(html, route) {
  const canonicalUrl = `${SITE_ORIGIN}${route.path}`;
  const title = escapeHtmlAttribute(route.seo.title);
  const description = escapeHtmlAttribute(route.seo.description);
  const escapedUrl = escapeHtmlAttribute(canonicalUrl);
  const metadata = [
    `<link rel="canonical" href="${escapedUrl}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="es_ES" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${escapedUrl}" />`,
    `<meta property="og:image" content="${SOCIAL_IMAGE}" />`,
    `<meta property="og:image:type" content="image/webp" />`,
    `<meta property="og:image:width" content="400" />`,
    `<meta property="og:image:height" content="400" />`,
    `<meta property="og:image:alt" content="Mascota de Grumphya" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${SOCIAL_IMAGE}" />`,
  ].join("\n    ");

  const titlePattern = /<title>[^<]*<\/title>/;
  const descriptionPattern =
    /<meta\s+name="description"\s+content="[^"]*"\s*\/>/;
  if (!titlePattern.test(html) || !descriptionPattern.test(html)) {
    throw new Error("Public HTML is missing its base title or description");
  }

  return html
    .replace(titlePattern, () => `<title>${title}</title>`)
    .replace(
      descriptionPattern,
      () => `<meta name="description" content="${description}" />`,
    )
    .replace("</head>", () => `    ${metadata}\n  </head>`);
}
