import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Pool } from "pg";
import type { AnonymousAnalyticsInput } from "./anonymous-analytics.models";

const REQUEST_WINDOW_MS = 60_000;
const MAX_EVENTS_PER_PROCESS_WINDOW = 600;
const DATABASE_ERROR_MESSAGE = "ANONYMOUS_ANALYTICS_UNAVAILABLE";

@Injectable()
export class AnonymousAnalyticsService {
  private readonly logger = new Logger(AnonymousAnalyticsService.name);
  private windowStartedAt: number;
  private acceptedEvents = 0;
  private readonly allowedOrigin: string;
  private readonly now: () => number;

  constructor(
    private readonly pool: Pool,
    allowedOrigin = process.env.WEB_ORIGIN ?? "http://127.0.0.1:5173",
    now: () => number = Date.now,
  ) {
    this.allowedOrigin = allowedOrigin;
    this.now = now;
    this.windowStartedAt = now();
  }

  async record(origin: string | undefined, event: AnonymousAnalyticsInput) {
    if (origin !== this.allowedOrigin) throw new ForbiddenException();
    if (!this.admitEvent()) {
      throw new HttpException(
        "ANONYMOUS_ANALYTICS_RATE_LIMIT",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    try {
      await this.pool.query(
        `INSERT INTO anonymous_analytics_daily
           (metric_date, event_name, page_code, device_class, plan_code, event_count)
         VALUES ((now() AT TIME ZONE 'Europe/Madrid')::date, $1, $2, $3, $4, 1)
         ON CONFLICT (metric_date, event_name, page_code, device_class, plan_code)
         DO UPDATE SET event_count = anonymous_analytics_daily.event_count + 1`,
        [event.event, event.page, event.device, event.plan ?? ""],
      );
    } catch {
      this.logger.warn(DATABASE_ERROR_MESSAGE);
      throw new ServiceUnavailableException();
    }
  }

  private admitEvent(): boolean {
    const currentTime = this.now();
    if (currentTime - this.windowStartedAt >= REQUEST_WINDOW_MS) {
      this.windowStartedAt = currentTime;
      this.acceptedEvents = 0;
    }
    if (this.acceptedEvents >= MAX_EVENTS_PER_PROCESS_WINDOW) return false;
    this.acceptedEvents += 1;
    return true;
  }
}
