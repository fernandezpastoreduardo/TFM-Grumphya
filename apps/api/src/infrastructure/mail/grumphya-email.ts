export type GrumphyaEmailAction = { label: string; url: string };

export type GrumphyaEmailContent = {
  title: string;
  preheader: string;
  paragraphs: readonly string[];
  action?: GrumphyaEmailAction;
};

export type RenderedGrumphyaEmail = { html: string; text: string };

const EMAIL_BACKGROUND = "#d0f6e4";
const EMAIL_INK = "#172123";
const EMAIL_TEAL = "#087887";
const EMAIL_DARK = "#203c3b";
const EMAIL_PINK = "#f18aa0";
const EMAIL_PAPER = "#fffefa";
const EMAIL_FONT = "Arial,Helvetica,sans-serif";

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
        `<p style="margin:0 0 16px;color:${EMAIL_INK};font:16px/1.6 ${EMAIL_FONT};">${paragraph}</p>`,
    )
    .join("");
  const htmlAction = action
    ? `<tr><td style="padding:4px 32px 20px;"><a href="${action.url}" style="display:inline-block;border:2px solid ${EMAIL_DARK};border-radius:999px;padding:13px 22px;background:${EMAIL_TEAL};color:#fff;font:700 16px ${EMAIL_FONT};text-decoration:none;">${action.label}</a></td></tr><tr><td style="padding:0 32px 28px;color:#44585a;font:14px/1.5 ${EMAIL_FONT};">Si el botón no funciona, copia este enlace en el navegador:<br><a href="${action.url}" style="color:${EMAIL_TEAL};word-break:break-all;">${action.url}</a></td></tr>`
    : "";
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${title}</title></head><body style="margin:0;padding:24px 12px;background:${EMAIL_BACKGROUND};"><span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${preheader}</span><table role="presentation" style="width:100%;max-width:600px;margin:0 auto;border:2px solid ${EMAIL_TEAL};border-radius:24px;background:${EMAIL_PAPER};border-spacing:0;overflow:hidden;"><tr><td style="padding:22px 32px;background:${EMAIL_DARK};color:${EMAIL_PAPER};font:700 18px ${EMAIL_FONT};letter-spacing:.04em;">GRUMPHYA <span style="color:${EMAIL_PINK};">·</span> Será por malas ideas.</td></tr><tr><td style="height:6px;padding:0;background:#f4c95d;"></td></tr><tr><td style="padding:30px 32px 12px;"><h1 style="margin:0 0 20px;color:${EMAIL_INK};font:700 28px/1.2 ${EMAIL_FONT};">${title}</h1>${htmlParagraphs}</td></tr>${htmlAction}<tr><td style="padding:0 32px 26px;color:#44585a;font:13px/1.5 ${EMAIL_FONT};">Este mensaje se ha enviado desde Grumphya.<br>Si no reconoces esta actividad, puedes ignorar el correo.</td></tr></table></body></html>`;
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
