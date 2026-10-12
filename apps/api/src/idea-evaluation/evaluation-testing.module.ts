import { Module } from "@nestjs/common";
import { EVALUATION_PORT } from "./evaluation-port";
import { EvaluationProcessService } from "./evaluation-process.service";
import { FakeEvaluationPort } from "./fake-evaluation.port";

@Module({
  providers: [
    EvaluationProcessService,
    FakeEvaluationPort,
    { provide: EVALUATION_PORT, useExisting: FakeEvaluationPort },
  ],
})
export class EvaluationTestingModule {}
