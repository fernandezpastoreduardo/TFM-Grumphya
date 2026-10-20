export type GrumphyaEmailAction = { label: string; url: string };

export type GrumphyaEmailContent = {
  title: string;
  preheader: string;
  paragraphs: readonly string[];
  action?: GrumphyaEmailAction;
};

export type RenderedGrumphyaEmail = { html: string; text: string };

export function renderGrumphyaEmail(
  content: GrumphyaEmailContent,
): RenderedGrumphyaEmail {
  const title = escapeHtml(content.title);
  const preheader = escapeHtml(content.preheader);
  const paragraphs = content.paragraphs.map((value) => escapeHtml(value));
  const action = content.action
    ? {
        label: escapeHtml(content.action.label),
        url: escapeAttribute(content.action.url),
      }
    : undefined;
  const htmlParagraphs = paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;color:#343044;font:16px/1.6 Arial,sans-serif;">${paragraph}</p>`,
    )
    .join("");
  const htmlAction = action
    ? `<p style="margin:24px 0"><a href="${action.url}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#4f46e5;color:#fff;font:600 16px Arial,sans-serif;text-decoration:none;">${action.label}</a></p><p style="margin:0 0 16px;color:#5e596a;font:14px/1.5 Arial,sans-serif;">Si el botón no funciona, copia este enlace en el navegador:<br><a href="${action.url}" style="color:#4338ca;word-break:break-all;">${action.url}</a></p>`
    : "";
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;padding:24px;background:#f5f3ff;"><span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${preheader}</span><table role="presentation" style="width:100%;max-width:600px;margin:0 auto;border-collapse:collapse;background:#fff;border-radius:16px;"><tr><td style="padding:32px 28px 12px;color:#4338ca;font:bold 14px Arial,sans-serif;letter-spacing:.08em;">GRUMPHYA</td></tr><tr><td style="padding:8px 28px 32px;"><h1 style="margin:0 0 20px;color:#251f35;font:700 26px/1.25 Arial,sans-serif;">${title}</h1>${htmlParagraphs}${htmlAction}<p style="margin:28px 0 0;color:#777184;font:13px/1.5 Arial,sans-serif;">Este mensaje se ha enviado desde Grumphya.</p></td></tr></table></body></html>`;
  const text = [
    content.title,
    "",
    ...content.paragraphs,
    "",
    ...(action ? [`${content.action!.label}: ${content.action!.url}`] : []),
    "",
    "Este mensaje se ha enviado desde Grumphya.",
  ].join("\n");
  return { html, text };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => {
    if (character === "&") return "&amp;";
    if (character === "<") return "&lt;";
    if (character === ">") return "&gt;";
    return "&quot;";
  });
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
