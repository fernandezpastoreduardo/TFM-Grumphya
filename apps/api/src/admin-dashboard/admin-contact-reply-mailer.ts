import { Inject, Injectable } from "@nestjs/common";
import { renderGrumphyaEmail } from "../infrastructure/mail/grumphya-email";
import { MailService } from "../infrastructure/mail/mail.service";
import type { AdminContactReplyMailPort } from "./admin-contact-message-reply.service";

const DATE_FORMAT = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});
const EMAIL_TITLE = "Respuesta a tu mensaje";
const EMAIL_PREHEADER = "El equipo de Grumphya ha respondido a tu consulta.";
const EMAIL_INTRO = "Respuesta del equipo de Grumphya:";

@Injectable()
export class AdminContactReplyMailer implements AdminContactReplyMailPort {
  constructor(@Inject(MailService) private readonly mailService: MailService) {}

  async send(input: {
    recipient: string;
    subject: string;
    response: string;
    createdAt: string;
    reference: string;
  }): Promise<"sent" | "previewed"> {
    const date = DATE_FORMAT.format(new Date(input.createdAt));
    const { html, text } = renderGrumphyaEmail({
      title: EMAIL_TITLE,
      preheader: EMAIL_PREHEADER,
      paragraphs: [
        EMAIL_INTRO,
        input.response,
        `Referencia: ${input.reference}`,
        `Fecha: ${date}`,
      ],
    });
    const replyTo = process.env.MAIL_FROM_ADDRESS?.trim();
    return this.mailService.send({
      to: input.recipient,
      subject: input.subject,
      text,
      html,
      ...(replyTo ? { replyTo } : {}),
    });
  }
}
