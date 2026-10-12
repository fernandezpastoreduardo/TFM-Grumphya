import { Module } from "@nestjs/common";
import { EvaluationProcessController } from "./evaluation-process.controller";
import { EVALUATION_PORT } from "./evaluation-port";
import { EvaluationProcessService } from "./evaluation-process.service";
import { FakeEvaluationPort } from "./fake-evaluation.port";

@Module({
  controllers: [EvaluationProcessController],
  providers: [
    EvaluationProcessService,
    FakeEvaluationPort,
    { provide: EVALUATION_PORT, useExisting: FakeEvaluationPort },
  ],
})
export class EvaluationTestingModule {}
