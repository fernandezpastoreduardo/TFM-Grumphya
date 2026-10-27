import { ServiceUnavailableException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createPostgresPool, query } = vi.hoisted(() => ({
  createPostgresPool: vi.fn(),
  query: vi.fn(),
}));

vi.mock("./infrastructure/database/postgres-pool", () => ({
  createPostgresPool,
}));

import { HealthController } from "./health.controller";

const PGVECTOR_VERSION = "0.8.0";
const HEALTH_QUERY =
  "select extversion as version from pg_extension where extname = 'vector'";

describe("HealthController", () => {
  const initialDeploySha = process.env.DEPLOY_SHA;

  beforeEach(() => {
    vi.clearAllMocks();
    createPostgresPool.mockReturnValue({ query });
    query.mockResolvedValue({ rows: [{ version: PGVECTOR_VERSION }] });
    delete process.env.DEPLOY_SHA;
  });

  afterEach(() => {
    if (initialDeploySha === undefined) {
      delete process.env.DEPLOY_SHA;
      return;
    }
    process.env.DEPLOY_SHA = initialDeploySha;
  });

  it("reports database, pgvector and local revision when healthy", async () => {
    const controller = new HealthController();

    await expect(controller.check()).resolves.toEqual({
      status: "ok",
      database: "ok",
      pgvector: PGVECTOR_VERSION,
      revision: "local",
    });
    expect(query).toHaveBeenCalledWith(HEALTH_QUERY);
  });

  it("reports the deployment revision when configured", async () => {
    process.env.DEPLOY_SHA = "release-123";
    const controller = new HealthController();

    await expect(controller.check()).resolves.toMatchObject({
      status: "ok",
      revision: "release-123",
    });
  });

  it("reports service unavailable when pgvector is missing", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const controller = new HealthController();

    await expect(controller.check()).rejects.toMatchObject({
      constructor: ServiceUnavailableException,
      response: { status: "error", database: "unavailable" },
      status: 503,
    });
  });

  it("reports service unavailable when the database query fails", async () => {
    query.mockRejectedValueOnce(new Error("database details"));
    const controller = new HealthController();

    await expect(controller.check()).rejects.toMatchObject({
      constructor: ServiceUnavailableException,
      response: { status: "error", database: "unavailable" },
      status: 503,
    });
  });
});
