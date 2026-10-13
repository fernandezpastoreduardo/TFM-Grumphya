import "reflect-metadata";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { NestFactory } from "@nestjs/core";
import { Module } from "@nestjs/common";
import { EvaluationTestingModule } from "../src/idea-evaluation/evaluation-testing.module";
import { createSecurityMiddleware } from "../src/security/security.middleware";
import { RegistrationController } from "../src/register-with-plan/registration.controller";
import { InMemoryRegistrationRepository } from "../src/register-with-plan/registration-testing.repository";
import { REGISTRATION_REPOSITORY } from "../src/register-with-plan/registration.repository";
import { DevelopmentVerificationDelivery } from "../src/register-with-plan/verification-delivery";

const DEFAULT_TEST_PORT = 3100;
const BODY_LIMIT = "8kb";

class IsolatedE2ETestModule {}
Module({
  imports: [EvaluationTestingModule],
  controllers: [RegistrationController],
  providers: [
    { provide: REGISTRATION_REPOSITORY, useClass: InMemoryRegistrationRepository },
    DevelopmentVerificationDelivery,
  ],
})(IsolatedE2ETestModule);

async function startEvaluationTestServer(): Promise<void> {
  const application = await NestFactory.create<NestExpressApplication>(
    IsolatedE2ETestModule,
    { logger: false },
  );
  application.setGlobalPrefix("api");
  application.useBodyParser("json", { limit: BODY_LIMIT });
  application.use(createSecurityMiddleware());
  const port = Number(process.env.EVALUATION_TEST_PORT ?? DEFAULT_TEST_PORT);
  await application.listen(port, "127.0.0.1");
}

void startEvaluationTestServer();
