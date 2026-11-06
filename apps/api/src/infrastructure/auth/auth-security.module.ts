import { Global, Module } from "@nestjs/common";
import {
  ACCESS_TOKEN_SESSION_LOOKUP,
  PostgresAccessTokenSessionLookup,
} from "./access-token-session.lookup";
import { AccessTokenGuard } from "./access-token.guard";
import { OptionalAccessTokenGuard } from "./optional-access-token.guard";
import {
  PendingEmailVerificationController,
  PendingEmailVerificationGuard,
  PendingEmailVerificationService,
} from "./pending-email-verification";

@Global()
@Module({
  controllers: [PendingEmailVerificationController],
  providers: [
    AccessTokenGuard,
    OptionalAccessTokenGuard,
    PendingEmailVerificationGuard,
    PendingEmailVerificationService,
    {
      provide: ACCESS_TOKEN_SESSION_LOOKUP,
      useFactory: () => new PostgresAccessTokenSessionLookup(),
    },
  ],
  exports: [
    AccessTokenGuard,
    OptionalAccessTokenGuard,
    PendingEmailVerificationGuard,
    PendingEmailVerificationService,
    ACCESS_TOKEN_SESSION_LOOKUP,
  ],
})
export class AuthSecurityModule {}
