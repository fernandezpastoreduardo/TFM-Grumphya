import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  LighthouseDevice,
  LighthousePageCode,
  LighthouseQualityRun,
} from "./admin-dashboard.models";
import {
  ADMIN_DASHBOARD_REPOSITORY,
  type AdminDashboardRepository,
} from "./admin-dashboard.models";
import { Inject } from "@nestjs/common";

const PAGE_CODES = new Set<LighthousePageCode>([
  "home",
  "precios",
  "lo-peor-de-lo-peor",
]);
const DEVICE_CODES = new Set<LighthouseDevice>(["mobile", "desktop"]);
const RUN_KEYS = [
  "commitSha",
  "measuredAt",
  "page",
  "device",
  "sampleCount",
  "performance",
  "accessibility",
  "bestPractices",
  "seo",
  "lcpMs",
  "cls",
  "tbtMs",
  "speedIndexMs",
] as const;
const INVALID_QUALITY_REPORT = "El informe de calidad web no es válido.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function isMetric(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0)
  );
}

function parseRun(value: unknown): LighthouseQualityRun | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value).sort();
  if (
    keys.length !== RUN_KEYS.length ||
    RUN_KEYS.some((key) => !(key in value))
  )
    return null;
  if (
    typeof value.commitSha !== "string" ||
    !/^[a-f0-9]{40}$/u.test(value.commitSha) ||
    typeof value.measuredAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value.measuredAt) ||
    !Number.isFinite(Date.parse(value.measuredAt)) ||
    typeof value.page !== "string" ||
    !PAGE_CODES.has(value.page as LighthousePageCode) ||
    typeof value.device !== "string" ||
    !DEVICE_CODES.has(value.device as LighthouseDevice) ||
    value.sampleCount !== 3 ||
    !isScore(value.performance) ||
    !isScore(value.accessibility) ||
    !isScore(value.bestPractices) ||
    !isScore(value.seo) ||
    !isMetric(value.lcpMs) ||
    !isMetric(value.cls) ||
    !isMetric(value.tbtMs) ||
    !isMetric(value.speedIndexMs)
  )
    return null;

  return value as LighthouseQualityRun;
}

export function parseLighthouseQualityPayload(
  value: unknown,
): LighthouseQualityRun[] {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 1 ||
    !Array.isArray(value.runs) ||
    value.runs.length !== 6
  ) {
    throw new BadRequestException({
      code: "INVALID_QUALITY_REPORT",
      message: INVALID_QUALITY_REPORT,
    });
  }
  const runs = value.runs.map(parseRun);
  if (runs.some((run) => run === null)) {
    throw new BadRequestException({
      code: "INVALID_QUALITY_REPORT",
      message: INVALID_QUALITY_REPORT,
    });
  }
  const combinations = new Set(
    runs.map((run) => `${run?.page}:${run?.device}`),
  );
  if (combinations.size !== 6) {
    throw new BadRequestException({
      code: "INVALID_QUALITY_REPORT",
      message: INVALID_QUALITY_REPORT,
    });
  }
  const commits = new Set(runs.map((run) => run?.commitSha));
  const dates = new Set(runs.map((run) => run?.measuredAt));
  if (commits.size !== 1 || dates.size !== 1) {
    throw new BadRequestException({
      code: "INVALID_QUALITY_REPORT",
      message: INVALID_QUALITY_REPORT,
    });
  }
  return runs as LighthouseQualityRun[];
}

@Injectable()
export class LighthouseQualityService {
  constructor(
    @Inject(ADMIN_DASHBOARD_REPOSITORY)
    private readonly repository: AdminDashboardRepository,
  ) {}

  async getLatest() {
    return this.repository.getLighthouseQuality();
  }

  async ingest(payload: unknown) {
    const runs = parseLighthouseQualityPayload(payload);
    await this.repository.saveLighthouseQuality(runs);
    return { accepted: runs.length };
  }
}
