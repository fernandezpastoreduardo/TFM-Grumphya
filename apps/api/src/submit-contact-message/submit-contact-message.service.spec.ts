import { describe, expect, it, vi } from "vitest";
import {
  ContactMessageError,
  type ContactMessageRepository,
} from "./submit-contact-message.models";
import { SubmitContactMessage } from "./submit-contact-message.service";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const VALID_SUBJECT = "Consulta";
const VALID_MESSAGE = "Mensaje suficientemente largo";

describe("SubmitContactMessage", () => {
  it("validates, trims, and stores a message for the authenticated user", async () => {
    const repository: ContactMessageRepository = {
      createForUser: vi.fn().mockResolvedValue(undefined),
    };
    const feature = new SubmitContactMessage(repository);

    await feature.execute(USER_ID, {
      subject: "  Consulta de mi cuenta  ",
      message: "  Necesito ayuda con el estado de mi plan.  ",
    });

    expect(repository.createForUser).toHaveBeenCalledWith(
      USER_ID,
      "Consulta de mi cuenta",
      "Necesito ayuda con el estado de mi plan.",
    );
  });

  it.each([
    null,
    { subject: "x", message: VALID_MESSAGE },
    { subject: VALID_SUBJECT, message: "corto" },
    { subject: "x".repeat(121), message: VALID_MESSAGE },
    { subject: VALID_SUBJECT, message: "m".repeat(4001) },
    {
      subject: VALID_SUBJECT,
      message: VALID_MESSAGE,
      email: "spoof@example.com",
    },
    { subject: "   ", message: VALID_MESSAGE },
    { subject: VALID_SUBJECT, message: "          " },
    { subject: 123, message: VALID_MESSAGE },
    { subject: VALID_SUBJECT, message: ["mensaje", "en partes"] },
    [],
    "mensaje",
  ])("rejects invalid or unexpected contact data", async (payload) => {
    const repository: ContactMessageRepository = {
      createForUser: vi.fn(),
    };
    const feature = new SubmitContactMessage(repository);

    await expect(feature.execute(USER_ID, payload)).rejects.toMatchObject({
      code: "INVALID_CONTACT_MESSAGE",
    });
    expect(repository.createForUser).not.toHaveBeenCalled();
  });

  it("accepts the exact minimum and maximum field lengths", async () => {
    const repository: ContactMessageRepository = {
      createForUser: vi.fn().mockResolvedValue(undefined),
    };
    const feature = new SubmitContactMessage(repository);

    await feature.execute(USER_ID, {
      subject: "abc",
      message: "1234567890",
    });
    await feature.execute(USER_ID, {
      subject: "s".repeat(120),
      message: "m".repeat(4000),
    });

    expect(repository.createForUser).toHaveBeenNthCalledWith(
      1,
      USER_ID,
      "abc",
      "1234567890",
    );
    expect(repository.createForUser).toHaveBeenNthCalledWith(
      2,
      USER_ID,
      "s".repeat(120),
      "m".repeat(4000),
    );
  });

  it("does not accept an invalid authenticated user identifier", async () => {
    const feature = new SubmitContactMessage({
      createForUser: vi.fn(),
    });

    await expect(
      feature.execute("not-a-user", {
        subject: "Consulta",
        message: "Mensaje suficientemente largo",
      }),
    ).rejects.toBeInstanceOf(ContactMessageError);
  });
});
