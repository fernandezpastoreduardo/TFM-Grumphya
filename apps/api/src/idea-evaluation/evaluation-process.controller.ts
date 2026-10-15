import { Body, Controller, Headers, Inject, Post } from "@nestjs/common";
import { IdeaSubmissionService } from "./idea-submission.service";

@Controller("evaluation-process")
export class EvaluationProcessController {
  constructor(
    @Inject(IdeaSubmissionService)
    private readonly ideaSubmission: IdeaSubmissionService,
  ) {}

  @Post()
  evaluate(
    @Body() input: unknown,
    @Headers("idempotency-key") idempotencyKey: unknown,
  ) {
    return this.ideaSubmission.submit(input, idempotencyKey);
  }
}
