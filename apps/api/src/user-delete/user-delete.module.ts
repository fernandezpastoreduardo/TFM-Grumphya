import { Module } from "@nestjs/common";
import { UserDeleteController } from "./user-delete.controller";
import { USER_DELETE_REPOSITORY } from "./user-delete.models";
import { PostgresUserDeleteRepository } from "./postgres-user-delete.repository";
import { AccessTokenGuard } from "../infrastructure/auth/access-token.guard";
import {
  ACCESS_TOKEN_SESSION_LOOKUP,
  PostgresAccessTokenSessionLookup,
} from "../infrastructure/auth/access-token-session.lookup";

@Module({
  controllers: [UserDeleteController],
  providers: [
    {
      provide: USER_DELETE_REPOSITORY,
      useClass: PostgresUserDeleteRepository,
    },
    {
      provide: ACCESS_TOKEN_SESSION_LOOKUP,
      useFactory: () => new PostgresAccessTokenSessionLookup(),
    },
    AccessTokenGuard,
  ],
})
export class UserDeleteModule {}
