import { describe, expect, it } from "vitest";
import { renderGrumphyaEmail } from "./grumphya-email";

describe("Grumphya email layout", () => {
  it("returns accessible inline HTML and plain text without external resources", () => {
    const email = renderGrumphyaEmail({
      title: "Revisa tu correo",
      preheader: "Un paso para completar el registro",
      paragraphs: ["Pulsa para confirmar."],
      action: {
        label: "Verificar correo",
        url: "https://example.test/verificar-cuenta?token=abc",
      },
    });

    expect(email.html).toContain('lang="es"');
    expect(email.html).toContain("style=");
    expect(email.html).toContain("#087887");
    expect(email.html).toContain("#f4c95d");
    expect(email.html).toContain('<td align="center"');
    expect(email.html).toContain('align="center" width="600"');
    expect(email.html).toContain(
      "https://example.test/verificar-cuenta?token=abc",
    );
    expect(email.html).not.toContain("<img");
    expect(email.html).not.toContain("https://tracker");
    expect(email.text).toContain("Verificar correo:");
  });

  it("escapes untrusted text and action values", () => {
    const email = renderGrumphyaEmail({
      title: "<script>alert(1)</script>",
      preheader: "A & B",
      paragraphs: ['Texto "privado" <img src=x>'],
      action: {
        label: "Continuar",
        url: "https://example.test/?q=a&x=<script>",
      },
    });

    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("A &amp; B");
    expect(email.html).toContain("x=&lt;script&gt;");
    expect(email.text).toContain("<script>alert(1)</script>");
  });
});
