import { Module } from "@nestjs/common";
import { AccessTokenGuard } from "../infrastructure/auth/access-token.guard";
import {
  USER_AVATAR_MODERATOR,
  USER_AVATAR_PROCESSOR,
  USER_AVATAR_REPOSITORY,
  USER_AVATAR_STORAGE,
} from "./user-avatar.models";
import { UserAvatarController } from "./user-avatar.controller";
import { UserAvatarService } from "./user-avatar.service";
import { PostgresUserAvatarRepository } from "./postgres-user-avatar.repository";
import { LocalUserAvatarStorage } from "./local-user-avatar.storage";
import { SharpUserAvatarProcessor } from "./sharp-user-avatar.processor";
import { OpenAiUserAvatarModerator } from "./openai-user-avatar.moderator";
import { recordBackendProcessorRegistration } from "../infrastructure/observability/backend-processors-registry";

function createAvatarModerator(): OpenAiUserAvatarModerator {
  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  const moderator = new OpenAiUserAvatarModerator(apiKey);
  recordBackendProcessorRegistration(
    "openai-avatar-moderation",
    apiKey
      ? {
          providerId: "openai",
          displayName: "OpenAI",
          product: "Moderations API",
        }
      : null,
  );
  return moderator;
}

@Module({
  controllers: [UserAvatarController],
  providers: [
    UserAvatarService,
    AccessTokenGuard,
    {
      provide: USER_AVATAR_REPOSITORY,
      useFactory: () => new PostgresUserAvatarRepository(),
    },
    { provide: USER_AVATAR_STORAGE, useClass: LocalUserAvatarStorage },
    { provide: USER_AVATAR_PROCESSOR, useClass: SharpUserAvatarProcessor },
    { provide: USER_AVATAR_MODERATOR, useFactory: createAvatarModerator },
  ],
  exports: [UserAvatarService],
})
export class UserAvatarModule {}
