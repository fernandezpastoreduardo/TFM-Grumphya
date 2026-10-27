import { NotFoundException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MailService } from "./mail.service";
import { LocalMailPreviewController } from "./mail-preview.controller";

const LOCAL_PREVIEW = {
  to: "person@example.com",
  subject: "Confirma tu cuenta",
  text: "Texto del correo",
  html: "<p>Texto del correo</p>",
  createdAt: "2026-10-27T12:00:00.000Z",
};

describe("LocalMailPreviewController", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("hides the preview endpoint in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const mailService = {
      getLatestLocalPreview: vi.fn(),
    } as unknown as MailService;
    const controller = new LocalMailPreviewController(mailService);

    expect(() => controller.latest()).toThrow(NotFoundException);
    expect(mailService.getLatestLocalPreview).not.toHaveBeenCalled();
  });

  it("returns not found when there is no local preview", () => {
    vi.stubEnv("NODE_ENV", "test");
    const mailService = {
      getLatestLocalPreview: vi.fn().mockReturnValue(undefined),
    } as unknown as MailService;
    const controller = new LocalMailPreviewController(mailService);

    expect(() => controller.latest()).toThrow(NotFoundException);
    expect(mailService.getLatestLocalPreview).toHaveBeenCalledOnce();
  });

  it("returns the latest local preview outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    const mailService = {
      getLatestLocalPreview: vi.fn().mockReturnValue(LOCAL_PREVIEW),
    } as unknown as MailService;
    const controller = new LocalMailPreviewController(mailService);

    expect(controller.latest()).toBe(LOCAL_PREVIEW);
    expect(mailService.getLatestLocalPreview).toHaveBeenCalledOnce();
  });
});
