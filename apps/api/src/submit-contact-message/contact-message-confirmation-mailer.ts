import { Inject, Injectable } from "@nestjs/common";
import { MailService } from "../infrastructure/mail/mail.service";
import { renderGrumphyaEmail } from "../infrastructure/mail/grumphya-email";
import type { ContactMessageMailer } from "./submit-contact-message.models";

const DATE_FORMAT = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});
const CONFIRMATION_TITLE = "Hemos recibido correctamente tu mensaje";
const CONFIRMATION_PREHEADER = "Tu mensaje quedó guardado en Grumphya.";

@Injectable()
export class ContactMessageConfirmationMailer implements ContactMessageMailer {
  constructor(@Inject(MailService) private readonly mailService: MailService) {}

  async sendConfirmation(input: {
    recipient: string;
    subject: string;
    createdAt: string;
    reference: string;
  }): Promise<"sent" | "previewed"> {
    const date = DATE_FORMAT.format(new Date(input.createdAt));
    const { html, text } = renderGrumphyaEmail({
      title: CONFIRMATION_TITLE,
      preheader: CONFIRMATION_PREHEADER,
      paragraphs: [
        "Hemos guardado tu mensaje y el equipo podrá revisarlo desde Grumphya.",
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
