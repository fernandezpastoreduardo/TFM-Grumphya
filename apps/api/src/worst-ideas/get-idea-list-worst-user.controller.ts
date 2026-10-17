import { Controller, Get, Inject, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AccessTokenGuard } from "../infrastructure/auth/access-token.guard";
import { GetIdeaListWorstUser } from "./get-idea-list-worst-user.service";

type AuthenticatedRequest = Request & { user?: { userId: string } };

@Controller("account/worst-ideas")
@UseGuards(AccessTokenGuard)
export class GetIdeaListWorstUserController {
  constructor(
    @Inject(GetIdeaListWorstUser)
    private readonly getIdeaListWorstUser: GetIdeaListWorstUser,
  ) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.getIdeaListWorstUser.execute(request.user?.userId);
  }
}
