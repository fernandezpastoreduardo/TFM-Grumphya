import { Controller, Get, Header, Param } from "@nestjs/common";
import {
  PublicScanService,
  type PublicDomainStatus,
  type PublicReport,
} from "./public-scan.service.js";

const CACHE_CONTROL_NO_STORE = "no-store";

@Controller()
export class PublicScanController {
  constructor(private readonly scans: PublicScanService) {}

  @Get("domains/:hostname/status")
  @Header("Cache-Control", CACHE_CONTROL_NO_STORE)
  getDomainStatus(
    @Param("hostname") hostname: string,
  ): Promise<PublicDomainStatus> {
    return this.scans.getDomainStatus(hostname);
  }

  @Get("reports/:reportId")
  @Header("Cache-Control", CACHE_CONTROL_NO_STORE)
  getReport(@Param("reportId") reportId: string): Promise<PublicReport> {
    return this.scans.getReport(reportId);
  }
}
