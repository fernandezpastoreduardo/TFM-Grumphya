import "reflect-metadata";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { NestFactory } from "@nestjs/core";
import { Module } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { EvaluationTestingModule } from "../src/idea-evaluation/evaluation-testing.module";
import { createSecurityMiddleware } from "../src/security/security.middleware";
import { RegistrationController } from "../src/register-with-plan/registration.controller";
import { InMemoryRegistrationRepository } from "../src/register-with-plan/registration-testing.repository";
import { REGISTRATION_REPOSITORY } from "../src/register-with-plan/registration.repository";
import { ACCESS_TOKEN_SESSION_LOOKUP } from "../src/infrastructure/auth/access-token-session.lookup";
import { AccessTokenGuard } from "../src/infrastructure/auth/access-token.guard";
import { UserDeleteController } from "../src/user-delete/user-delete.controller";
import { USER_DELETE_REPOSITORY } from "../src/user-delete/user-delete.models";
import { MailModule } from "../src/infrastructure/mail/mail.module";
import { MailService } from "../src/infrastructure/mail/mail.service";
import { RegistrationService } from "../src/register-with-plan/registration.service";

const DEFAULT_TEST_PORT = 3100;
const BODY_LIMIT = "8kb";
const registrationRepository = new InMemoryRegistrationRepository();

class IsolatedE2ETestModule {}
Module({
  imports: [EvaluationTestingModule, MailModule],
  controllers: [RegistrationController, UserDeleteController],
  providers: [
    AccessTokenGuard,
    {
      provide: REGISTRATION_REPOSITORY,
      useValue: registrationRepository,
    },
    {
      provide: RegistrationService,
      useFactory: (
        repository: InMemoryRegistrationRepository,
        mail: MailService,
      ) => new RegistrationService(repository, mail),
      inject: [REGISTRATION_REPOSITORY, MailService],
    },
    {
      provide: ACCESS_TOKEN_SESSION_LOOKUP,
      useValue: {
        isActive: (tokenHash: string, userId: string) =>
          registrationRepository.isActive(tokenHash, userId),
      },
    },
    {
      provide: USER_DELETE_REPOSITORY,
      useValue: {
        deleteUser: async (userId: string) => {
          const userIndex = registrationRepository.users.findIndex(
            (user) => user.id === userId,
          );
          if (userIndex < 0) return false;
          registrationRepository.users.splice(userIndex, 1);
          removeOwnedItems(registrationRepository.sessions, userId);
          removeOwnedItems(registrationRepository.subscriptions, userId);
          removeOwnedItems(registrationRepository.goodIdeas, userId);
          removeOwnedItems(registrationRepository.registrations, userId);
          return true;
        },
      },
    },
  ],
})(IsolatedE2ETestModule);

function removeOwnedItems<T extends { userId: string }>(
  items: T[],
  userId: string,
): void {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index]?.userId === userId) items.splice(index, 1);
  }
}

async function startEvaluationTestServer(): Promise<void> {
  const application = await NestFactory.create<NestExpressApplication>(
    IsolatedE2ETestModule,
    { logger: false },
  );
  application.setGlobalPrefix("api");
  application.useBodyParser("json", { limit: BODY_LIMIT });
  application.use(
    createSecurityMiddleware({ sessionRefreshRequestLimit: 100 }),
  );
  application.use("/api/health", (_request: Request, response: Response) => {
    response
      .status(200)
      .json({ status: "ok", database: "ok", pgvector: "test" });
  });
  application.use(
    "/api/anonymous-usage",
    (request: Request, response: Response, next: NextFunction) => {
      if (request.method !== "POST") {
        next();
        return;
      }
      response.status(200).json({
        ideas: { limit: 3, used: 0, remaining: 3 },
        roasts: { limit: 3, used: 0, remaining: 3 },
      });
    },
  );
  const port = Number(process.env.EVALUATION_TEST_PORT ?? DEFAULT_TEST_PORT);
  await application.listen(port, "127.0.0.1");
}

void startEvaluationTestServer();
