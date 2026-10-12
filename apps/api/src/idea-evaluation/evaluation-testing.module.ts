import { Module } from "@nestjs/common";
import { EvaluationProcessController } from "./evaluation-process.controller";
import { EvaluationTestReadinessController } from "./evaluation-test-readiness.controller";
import { EVALUATION_PORT } from "./evaluation-port";
import { EvaluationProcessService } from "./evaluation-process.service";
import { FakeEvaluationPort } from "./fake-evaluation.port";

@Module({
  controllers: [EvaluationProcessController, EvaluationTestReadinessController],
  providers: [
    EvaluationProcessService,
    FakeEvaluationPort,
    { provide: EVALUATION_PORT, useExisting: FakeEvaluationPort },
  ],
})
export class EvaluationTestingModule {}
