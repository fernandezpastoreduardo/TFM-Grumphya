import {
  Body,
  BadRequestException,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { parseAnonymousAnalyticsInput } from "./anonymous-analytics.models";
import { AnonymousAnalyticsService } from "./anonymous-analytics.service";

@Controller("anonymous-analytics")
export class AnonymousAnalyticsController {
  constructor(private readonly analytics: AnonymousAnalyticsService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header("Cache-Control", "no-store")
  async record(@Req() request: Request, @Body() body: unknown): Promise<void> {
    const event = parseAnonymousAnalyticsInput(body);
    if (!event) throw new BadRequestException();
    await this.analytics.record(request.headers.origin, event);
  }
}
