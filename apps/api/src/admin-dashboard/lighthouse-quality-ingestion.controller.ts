import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { LighthouseQualityIngestionGuard } from "./lighthouse-quality-ingestion.guard";
import { LighthouseQualityService } from "./lighthouse-quality";

@Controller("internal/lighthouse-quality")
@UseGuards(LighthouseQualityIngestionGuard)
export class LighthouseQualityIngestionController {
  constructor(
    @Inject(LighthouseQualityService)
    private readonly lighthouseQuality: LighthouseQualityService,
  ) {}

  @Post("ingest")
  ingest(@Body() payload: unknown) {
    return this.lighthouseQuality.ingest(payload);
  }
}
