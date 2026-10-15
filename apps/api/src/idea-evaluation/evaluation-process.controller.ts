import { Body, Controller, Headers, Inject, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { IdeaSubmissionService } from "./idea-submission.service";
import { readCookie } from "../infrastructure/http/read-cookie";

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
    @Req() request: Request,
  ) {
    return this.ideaSubmission.submit(
      input,
      idempotencyKey,
      readCookie(request, "grumphya_anon"),
    );
  }
}
