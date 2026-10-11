import { Body, Controller, Inject, Post } from "@nestjs/common";
import { EvaluationProcessService } from "./evaluation-process.service";

@Controller("evaluation-process")
export class EvaluationProcessController {
  constructor(
    @Inject(EvaluationProcessService)
    private readonly evaluationProcess: EvaluationProcessService,
  ) {}

  @Post()
  evaluate(@Body() input: unknown) {
    return this.evaluationProcess.evaluate(input);
  }
}
