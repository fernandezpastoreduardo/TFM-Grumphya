import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { EvaluationProcessController } from "./idea-evaluation/evaluation-process.controller";
import { createEvaluationProvider } from "./idea-evaluation/evaluation-provider.factory";
import { EVALUATION_PORT } from "./idea-evaluation/evaluation-port";
import { EvaluationProcessService } from "./idea-evaluation/evaluation-process.service";
import { RegistrationModule } from "./register-with-plan/registration.module";

@Module({
  imports: [RegistrationModule],
  controllers: [HealthController, EvaluationProcessController],
  providers: [
    EvaluationProcessService,
    { provide: EVALUATION_PORT, useFactory: createEvaluationProvider },
  ],
})
export class AppModule {}
