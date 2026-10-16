import { Global, Module } from "@nestjs/common";
import {
  ACCESS_TOKEN_SESSION_LOOKUP,
  PostgresAccessTokenSessionLookup,
} from "./access-token-session.lookup";
import { AccessTokenGuard } from "./access-token.guard";
import { OptionalAccessTokenGuard } from "./optional-access-token.guard";

@Global()
@Module({
  providers: [
    AccessTokenGuard,
    OptionalAccessTokenGuard,
    {
      provide: ACCESS_TOKEN_SESSION_LOOKUP,
      useFactory: () => new PostgresAccessTokenSessionLookup(),
    },
  ],
  exports: [AccessTokenGuard, OptionalAccessTokenGuard, ACCESS_TOKEN_SESSION_LOOKUP],
})
export class AuthSecurityModule {}
