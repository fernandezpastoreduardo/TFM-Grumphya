import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { EvaluationProcessController } from "./idea-evaluation/evaluation-process.controller";
import { createEvaluationProvider } from "./idea-evaluation/evaluation-provider.factory";
import { EVALUATION_PORT } from "./idea-evaluation/evaluation-port";
import { EvaluationProcessService } from "./idea-evaluation/evaluation-process.service";

@Module({
  controllers: [HealthController, EvaluationProcessController],
  providers: [
    EvaluationProcessService,
    { provide: EVALUATION_PORT, useFactory: createEvaluationProvider },
  ],
})
export class AppModule {}
