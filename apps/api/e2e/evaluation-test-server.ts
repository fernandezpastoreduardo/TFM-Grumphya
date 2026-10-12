import "reflect-metadata";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { NestFactory } from "@nestjs/core";
import { EvaluationTestingModule } from "../src/idea-evaluation/evaluation-testing.module";
import { createSecurityMiddleware } from "../src/security/security.middleware";

const DEFAULT_TEST_PORT = 3100;
const BODY_LIMIT = "8kb";

async function startEvaluationTestServer(): Promise<void> {
  const application = await NestFactory.create<NestExpressApplication>(
    EvaluationTestingModule,
    { logger: false },
  );
  application.setGlobalPrefix("api");
  application.useBodyParser("json", { limit: BODY_LIMIT });
  application.use(createSecurityMiddleware());
  const port = Number(process.env.EVALUATION_TEST_PORT ?? DEFAULT_TEST_PORT);
  await application.listen(port, "127.0.0.1");
}

void startEvaluationTestServer();
