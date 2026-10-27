import { describe, expect, it, vi } from "vitest";
import {
  ContactMessageError,
  type ContactMessageRepository,
  type SavedContactMessage,
} from "./submit-contact-message.models";
import { SubmitContactMessageController } from "./submit-contact-message.controller";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const REQUEST_KEY = "10000000-0000-4000-8000-000000000001";
const MESSAGE_ID = "20000000-0000-4000-8000-000000000001";
const VALID_BODY = {
  subject: "Consulta",
  message: "Mensaje suficientemente largo",
};
const SAVED_MESSAGE: SavedContactMessage = {
  id: MESSAGE_ID,
  createdAt: "2026-10-20T10:00:00.000Z",
  recipient: "persona@example.es",
  subject: "Consulta",
  status: "pending",
  canRetry: true,
};

function createRepository(): ContactMessageRepository {
  return {
    createForUser: vi.fn().mockResolvedValue(SAVED_MESSAGE),
    getForUser: vi.fn().mockResolvedValue(SAVED_MESSAGE),
    claimConfirmation: vi.fn().mockResolvedValue("in_progress"),
    markConfirmationSent: vi.fn().mockResolvedValue(undefined),
    markConfirmationPreviewed: vi.fn().mockResolvedValue(undefined),
    markConfirmationFailed: vi.fn().mockResolvedValue(true),
  };
}

function createController(repository: ContactMessageRepository) {
  return new SubmitContactMessageController(repository, {
    sendConfirmation: vi.fn(),
  });
}

const CONTACT_ERROR = new ContactMessageError(
  "INVALID_CONTACT_MESSAGE",
  400,
  "Revisa el mensaje.",
);

describe("SubmitContactMessageController", () => {
  it("returns only the public fields from the saved contact message", async () => {
    const repository = createRepository();
    const controller = createController(repository);

    await expect(
      controller.submit(
        { user: { userId: USER_ID } } as never,
        REQUEST_KEY,
        VALID_BODY,
      ),
    ).resolves.toEqual({
      status: "saved",
      confirmation: "pending",
      retryAllowed: true,
      reference: MESSAGE_ID,
      createdAt: SAVED_MESSAGE.createdAt,
    });
    expect(repository.createForUser).toHaveBeenCalledWith(
      USER_ID,
      REQUEST_KEY,
      VALID_BODY.subject,
      VALID_BODY.message,
    );
  });

  it("converts contact message errors from submit into HTTP errors", async () => {
    const repository = createRepository();
    vi.mocked(repository.createForUser).mockRejectedValue(CONTACT_ERROR);
    const controller = createController(repository);

    await expect(
      controller.submit(
        { user: { userId: USER_ID } } as never,
        REQUEST_KEY,
        VALID_BODY,
      ),
    ).rejects.toMatchObject({
      status: 400,
      response: {
        statusCode: 400,
        code: "INVALID_CONTACT_MESSAGE",
        message: "Revisa el mensaje.",
      },
    });
  });

  it("propagates unexpected submit errors unchanged", async () => {
    const repository = createRepository();
    const unexpectedError = new Error("private repository detail");
    vi.mocked(repository.createForUser).mockRejectedValue(unexpectedError);
    const controller = createController(repository);

    await expect(
      controller.submit(
        { user: { userId: USER_ID } } as never,
        REQUEST_KEY,
        VALID_BODY,
      ),
    ).rejects.toBe(unexpectedError);
  });

  it("returns only the public fields from a retried confirmation", async () => {
    const repository = createRepository();
    const controller = createController(repository);

    await expect(
      controller.retryConfirmation(
        { user: { userId: USER_ID } } as never,
        MESSAGE_ID,
      ),
    ).resolves.toEqual({
      status: "saved",
      confirmation: "pending",
      retryAllowed: true,
      reference: MESSAGE_ID,
      createdAt: SAVED_MESSAGE.createdAt,
    });
    expect(repository.getForUser).toHaveBeenCalledWith(USER_ID, MESSAGE_ID);
    expect(repository.claimConfirmation).toHaveBeenCalledWith(
      USER_ID,
      MESSAGE_ID,
    );
  });

  it("converts contact message errors from confirmation retry into HTTP errors", async () => {
    const repository = createRepository();
    vi.mocked(repository.getForUser).mockResolvedValue(null);
    const controller = createController(repository);

    await expect(
      controller.retryConfirmation(
        { user: { userId: USER_ID } } as never,
        MESSAGE_ID,
      ),
    ).rejects.toMatchObject({
      status: 404,
      response: {
        statusCode: 404,
        code: "CONTACT_MESSAGE_NOT_FOUND",
        message: "No se ha encontrado el mensaje.",
      },
    });
  });

  it("propagates unexpected confirmation retry errors unchanged", async () => {
    const repository = createRepository();
    const unexpectedError = new Error("private repository detail");
    vi.mocked(repository.getForUser).mockRejectedValue(unexpectedError);
    const controller = createController(repository);

    await expect(
      controller.retryConfirmation(
        { user: { userId: USER_ID } } as never,
        MESSAGE_ID,
      ),
    ).rejects.toBe(unexpectedError);
  });
});
