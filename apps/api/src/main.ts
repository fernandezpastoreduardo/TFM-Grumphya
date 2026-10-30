import "reflect-metadata";
import { NestExpressApplication } from "@nestjs/platform-express";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { createSecurityMiddleware } from "./security/security.middleware";
import { LoginAbuseProtection } from "./security/login-abuse-protection.service";

const ACCESS_TOKEN_SECRET_MIN_BYTES = 32;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const webOrigin = process.env.WEB_ORIGIN;
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.ANONYMOUS_IP_HMAC_SECRET?.trim()
  ) {
    throw new Error(
      "ANONYMOUS_IP_HMAC_SECRET must be configured in production.",
    );
  }
  if (process.env.NODE_ENV === "production" && !webOrigin) {
    throw new Error("WEB_ORIGIN must be configured in production.");
  }
  if (
    Buffer.byteLength(process.env.ACCESS_TOKEN_SECRET ?? "", "utf8") <
    ACCESS_TOKEN_SECRET_MIN_BYTES
  ) {
    throw new Error(
      "ACCESS_TOKEN_SECRET must be configured with at least 32 bytes.",
    );
  }
  const allowedWebOrigin = webOrigin ?? "http://127.0.0.1:5173";
  const parsedWebOrigin = new URL(allowedWebOrigin);
  if (
    parsedWebOrigin.origin !== allowedWebOrigin ||
    (process.env.NODE_ENV === "production" &&
      parsedWebOrigin.protocol !== "https:")
  ) {
    throw new Error(
      "WEB_ORIGIN must be a single valid HTTPS origin in production.",
    );
  }

  app.setGlobalPrefix("api");
  app.set("trust proxy", process.env.TRUST_PROXY ?? false);
  app.enableCors({
    origin: allowedWebOrigin,
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
    maxAge: 600,
    credentials: true,
  });
  app.useBodyParser("json", {
    limit: "8kb",
    type: [
      "application/json",
      "application/csp-report",
      "application/reports+json",
    ],
  });
  app.use(
    createSecurityMiddleware({
      loginAbuseProtection: app.get(LoginAbuseProtection, { strict: false }),
    }),
  );
  const port = Number(process.env.API_PORT ?? 3000);
  const host =
    process.env.API_HOST ??
    (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
  await app.listen(port, host);
  console.log(`Grumphya API listening on http://${host}:${port}/api/health`);
}

void bootstrap();
