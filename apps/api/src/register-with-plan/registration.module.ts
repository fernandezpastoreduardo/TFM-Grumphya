import { Module } from "@nestjs/common";
import { RegistrationController } from "./registration.controller";
import { REGISTRATION_REPOSITORY } from "./registration.repository";
import { PostgresRegistrationRepository } from "./postgres-registration.repository";
import { DevelopmentVerificationDelivery } from "./verification-delivery";

@Module({
  controllers: [RegistrationController],
  providers: [
    { provide: REGISTRATION_REPOSITORY, useClass: PostgresRegistrationRepository },
    { provide: DevelopmentVerificationDelivery, useFactory: () => {
      if (process.env.NODE_ENV === "production") {
        throw new Error("Configure a production email delivery adapter before starting the API.");
      }
      return new DevelopmentVerificationDelivery();
    } },
  ],
})
export class RegistrationModule {}
