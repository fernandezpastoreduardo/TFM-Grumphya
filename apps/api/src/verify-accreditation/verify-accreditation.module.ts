import { Module } from "@nestjs/common";
import { GetAccreditationController } from "./get-accreditation.controller";
import { GetAccreditation } from "./get-accreditation.service";

@Module({
  controllers: [GetAccreditationController],
  providers: [
    {
      provide: GetAccreditation,
      useFactory: () => new GetAccreditation(),
    },
  ],
})
export class VerifyAccreditationModule {}
