import { afterEach, describe, expect, it, vi } from "vitest";
import { MailService } from "../infrastructure/mail/mail.service";
import { AdminContactReplyMailer } from "./admin-contact-reply-mailer";

const previousFromAddress = process.env.MAIL_FROM_ADDRESS;

afterEach(() => {
  if (previousFromAddress === undefined) delete process.env.MAIL_FROM_ADDRESS;
  else process.env.MAIL_FROM_ADDRESS = previousFromAddress;
});

describe("AdminContactReplyMailer", () => {
  it("renders escaped Grumphya HTML and plain text, replying to the configured mailbox", async () => {
    process.env.MAIL_FROM_ADDRESS = "support@example.es";
    const mailService = { send: vi.fn().mockResolvedValue("sent") };
    const mailer = new AdminContactReplyMailer(
      mailService as unknown as MailService,
    );

    await expect(
      mailer.send({
        recipient: "account-owner@example.es",
        subject: "Re: Consulta [00000000]",
        response: "Hola <img src=x onerror=alert(1)> & gracias.",
        createdAt: "2026-10-18T12:00:00.000Z",
        reference: "00000000-0000-4000-8000-000000000001",
      }),
    ).resolves.toBe("sent");

    expect(mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "account-owner@example.es",
        replyTo: "support@example.es",
        subject: "Re: Consulta [00000000]",
        html: expect.stringContaining(
          "&lt;img src=x onerror=alert(1)&gt; &amp;",
        ),
        text: expect.stringContaining(
          "Hola <img src=x onerror=alert(1)> & gracias.",
        ),
      }),
    );
    const outgoing = vi.mocked(mailService.send).mock.calls[0]?.[0];
    expect(outgoing?.html).not.toContain("<img src=x");
  });
});
