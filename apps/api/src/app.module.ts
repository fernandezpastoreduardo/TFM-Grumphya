import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { EvaluationProcessController } from "./idea-evaluation/evaluation-process.controller";
import { EvaluationProcessService } from "./idea-evaluation/evaluation-process.service";

@Module({
  controllers: [HealthController, EvaluationProcessController],
  providers: [EvaluationProcessService],
})
export class AppModule {}
