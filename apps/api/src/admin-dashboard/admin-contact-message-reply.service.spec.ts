import { describe, expect, it, vi } from "vitest";
import type {
  AdminDashboardRepository,
  ContactMessageReplyClaim,
} from "./admin-dashboard.models";
import { AdminContactMessageReply } from "./admin-contact-message-reply.service";

const ADMIN_ID = "00000000-0000-4000-8000-000000000099";
const MESSAGE_ID = "00000000-0000-4000-8000-000000000001";
const PRIVATE_EMAIL = "account-owner@example.es";
const RESPONSE = "Gracias por escribirnos. Te responderemos pronto.";

function makeClaim(overrides: Partial<ContactMessageReplyClaim> = {}) {
  return {
    id: MESSAGE_ID,
    subject: "Consulta inicial",
    createdAt: "2026-10-18T12:00:00.000Z",
    recipient: PRIVATE_EMAIL,
    status: "sending" as const,
    attemptedAt: "2026-10-20T10:00:00.000Z",
    attemptCount: 1,
    claimed: true,
    ...overrides,
  };
}

function setup(claim: ContactMessageReplyClaim | null = makeClaim()) {
  const repository = {
    claimContactMessageReply: vi.fn().mockResolvedValue(claim),
    completeContactMessageReply: vi.fn().mockResolvedValue(undefined),
  } as unknown as AdminDashboardRepository;
  const mailer = {
    send: vi.fn().mockResolvedValue("sent"),
  };
  return {
    repository,
    mailer,
    service: new AdminContactMessageReply(repository, mailer),
  };
}

describe("AdminContactMessageReply", () => {
  it("uses the recipient and subject returned by the database and records sent status", async () => {
    const { repository, mailer, service } = setup();
    const result = await service.execute(ADMIN_ID, MESSAGE_ID, {
      response: RESPONSE,
    });

    expect(repository.claimContactMessageReply).toHaveBeenCalledWith(
      MESSAGE_ID,
      ADMIN_ID,
      false,
    );
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: PRIVATE_EMAIL,
        subject: "Re: Consulta inicial [00000000]",
        response: RESPONSE,
        reference: MESSAGE_ID,
      }),
    );
    expect(repository.completeContactMessageReply).toHaveBeenCalledWith(
      MESSAGE_ID,
      "sent",
    );
    expect(result.status).toBe("sent");
  });

  it("returns not found without sending for an unknown contact message", async () => {
    const { mailer, service } = setup(null);

    await expect(
      service.execute(ADMIN_ID, MESSAGE_ID, { response: RESPONSE }),
    ).rejects.toMatchObject({ status: 404 });
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("rejects caller-supplied recipient and invalid response content", async () => {
    const { repository, mailer, service } = setup();

    await expect(
      service.execute(ADMIN_ID, MESSAGE_ID, {
        response: RESPONSE,
        to: "attacker@example.es",
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.execute(ADMIN_ID, MESSAGE_ID, { response: "short" }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.execute(ADMIN_ID, MESSAGE_ID, {
        response: "Respuesta\u0001 inválida y suficientemente larga",
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(repository.claimContactMessageReply).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("records uncertain delivery and only retries after explicit webmail review", async () => {
    const claim = makeClaim();
    const { repository, mailer, service } = setup(claim);
    mailer.send.mockRejectedValueOnce(
      new Error("SMTP detail must stay private"),
    );
    const first = await service.execute(ADMIN_ID, MESSAGE_ID, {
      response: RESPONSE,
    });
    expect(first).toMatchObject({ status: "uncertain", retryAllowed: true });
    expect(repository.completeContactMessageReply).toHaveBeenCalledWith(
      MESSAGE_ID,
      "uncertain",
    );

    vi.mocked(repository.claimContactMessageReply).mockResolvedValueOnce(
      makeClaim({ status: "uncertain", claimed: false }),
    );
    const blockedRetry = await service.execute(ADMIN_ID, MESSAGE_ID, {
      response: RESPONSE,
    });
    expect(blockedRetry.status).toBe("uncertain");
    expect(mailer.send).toHaveBeenCalledTimes(1);

    vi.mocked(repository.claimContactMessageReply).mockResolvedValueOnce(
      makeClaim({ status: "sending", attemptCount: 2 }),
    );
    const retry = await service.execute(ADMIN_ID, MESSAGE_ID, {
      response: RESPONSE,
      reviewedWebmail: true,
    });
    expect(retry.status).toBe("sent");
    expect(repository.claimContactMessageReply).toHaveBeenLastCalledWith(
      MESSAGE_ID,
      ADMIN_ID,
      true,
    );
    expect(mailer.send).toHaveBeenCalledTimes(2);
  });

  it("does not send twice when another request already claimed the message", async () => {
    const { mailer, service } = setup(
      makeClaim({ status: "sending", claimed: false }),
    );
    await expect(
      service.execute(ADMIN_ID, MESSAGE_ID, { response: RESPONSE }),
    ).resolves.toMatchObject({ status: "sending", retryAllowed: false });
    expect(mailer.send).not.toHaveBeenCalled();
  });
});
