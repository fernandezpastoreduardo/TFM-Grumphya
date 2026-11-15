import { describe, expect, it } from "vitest";
import { addPublicSeoMetadata } from "./public-seo.mjs";

const BASE_HTML =
  '<html><head><title>Base</title><meta name="description" content="Base" /></head><body></body></html>';

describe("addPublicSeoMetadata", () => {
  it("escapes HTML and keeps replacement tokens literal in metadata", () => {
    const html = addPublicSeoMetadata(BASE_HTML, {
      path: '/ruta?x="<script>',
      seo: {
        title: 'Precio $& <script>alert("x")</script>',
        description: "Crítica $' & <img src=x onerror=alert(1)>",
      },
    });

    expect(html).toContain(
      "<title>Precio $&amp; &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</title>",
    );
    expect(html).toContain(
      'content="Crítica $\' &amp; &lt;img src=x onerror=alert(1)&gt;"',
    );
    expect(html).toContain(
      'href="https://grumphya.com/ruta?x=&quot;&lt;script&gt;"',
    );
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
  });
});
