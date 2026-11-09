import {
  Body,
  Controller,
  Headers,
  Inject,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { IdeaSubmissionService } from "./idea-submission.service";
import { readCookie } from "../infrastructure/http/read-cookie";
import { OptionalAccessTokenGuard } from "../infrastructure/auth/optional-access-token.guard";
import { PendingEmailVerificationGuard } from "../infrastructure/auth/pending-email-verification";

type OptionalAuthenticatedRequest = Request & {
  user?: { userId: string };
};

@Controller("evaluation-process")
export class EvaluationProcessController {
  constructor(
    @Inject(IdeaSubmissionService)
    private readonly ideaSubmission: IdeaSubmissionService,
  ) {}

  @Post()
  @UseGuards(PendingEmailVerificationGuard, OptionalAccessTokenGuard)
  evaluate(
    @Body() input: unknown,
    @Headers("idempotency-key") idempotencyKey: unknown,
    @Req() request: OptionalAuthenticatedRequest,
  ) {
    return this.ideaSubmission.submit(
      input,
      idempotencyKey,
      readCookie(request, "grumphya_anon"),
      request.user?.userId,
    );
  }
}
