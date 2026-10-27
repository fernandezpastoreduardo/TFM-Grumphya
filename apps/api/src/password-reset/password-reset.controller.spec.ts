import { describe, expect, it, vi } from "vitest";
import { PasswordResetController } from "./password-reset.controller";

describe("PasswordResetController", () => {
  it("forwards password reset requests to the service", async () => {
    const body: unknown = { email: "persona@example.com" };
    const result = { message: "Solicitud recibida." };
    const service = { request: vi.fn().mockResolvedValue(result) };
    const controller = new PasswordResetController(service as never);

    await expect(controller.request(body)).resolves.toBe(result);
    expect(service.request).toHaveBeenCalledOnce();
    expect(service.request).toHaveBeenCalledWith(body);
  });

  it("forwards password reset completions to the service", async () => {
    const body: unknown = { token: "reset-token", password: "new-password" };
    const result = { message: "Contraseña actualizada." };
    const service = { complete: vi.fn().mockResolvedValue(result) };
    const controller = new PasswordResetController(service as never);

    await expect(controller.complete(body)).resolves.toBe(result);
    expect(service.complete).toHaveBeenCalledOnce();
    expect(service.complete).toHaveBeenCalledWith(body);
  });
});
