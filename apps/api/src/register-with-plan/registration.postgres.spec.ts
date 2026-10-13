import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { InMemoryVerificationDelivery } from "./verification-delivery";
import { PostgresRegistrationRepository } from "./postgres-registration.repository";
import { RegistrationService } from "./registration.service";

const DATABASE_URL = process.env.REGISTRATION_TEST_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("Postgres registration persistence", () => {
  let adminPool: Pool | undefined;
  let testPool: Pool | undefined;
  let repository: PostgresRegistrationRepository | undefined;
  let schemaName: string;

  afterEach(async () => {
    if (repository) await repository.close();
    else if (testPool) await testPool.end();
    if (adminPool && schemaName) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await adminPool.end();
    }
  });

  it("persists verification, the selected plan, a natural-month subscription and one simulated purchase atomically", async () => {
    adminPool = new Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 2_000 });
    const previousSchemas = await adminPool.query<{ schema_name: string }>("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'registration_test_%'");
    for (const row of previousSchemas.rows) await adminPool.query(`DROP SCHEMA IF EXISTS "${row.schema_name}" CASCADE`);
    schemaName = `registration_test_${randomUUID().replaceAll("-", "")}`;
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    testPool = new Pool({
      connectionString: DATABASE_URL,
      options: `-c search_path=${schemaName}`,
      connectionTimeoutMillis: 2_000,
    });
    repository = new PostgresRegistrationRepository(testPool);
    const delivery = new InMemoryVerificationDelivery();
    const service = new RegistrationService(repository, delivery);
    const intent = await service.createIntent("FALTON");
    await service.register(intent.token, {
      email: "Persona@example.es",
      username: "PersonaLista",
      password: "Una contraseña suficientemente segura 48!",
      privacyPolicyAcknowledged: true,
    });
    const verified = await service.verify(delivery.lastToken!);
    await service.confirm(verified.confirmationToken);
    await service.confirm(verified.confirmationToken);

    const result = await adminPool.query<{ users: string; plans: string; purchases: string; plan_code: string; days: number }>(
      `SELECT
         (SELECT count(*) FROM "${schemaName}".users)::text AS users,
         (SELECT count(*) FROM "${schemaName}".subscriptions)::text AS plans,
         (SELECT count(*) FROM "${schemaName}".simulated_purchases)::text AS purchases,
         (SELECT plan_code FROM "${schemaName}".subscriptions LIMIT 1) AS plan_code,
         (SELECT extract(epoch FROM expires_at - starts_at) / 86400 FROM "${schemaName}".subscriptions LIMIT 1)::int AS days`,
    );
    expect(result.rows[0]).toMatchObject({ users: "1", plans: "1", purchases: "1", plan_code: "FALTON" });
    expect(result.rows[0]!.days).toBeGreaterThanOrEqual(28);
    expect(result.rows[0]!.days).toBeLessThanOrEqual(31);
  });
});
