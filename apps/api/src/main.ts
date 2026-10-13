import "reflect-metadata";
import { NestExpressApplication } from "@nestjs/platform-express";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { createSecurityMiddleware } from "./security/security.middleware";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const webOrigin = process.env.WEB_ORIGIN;
  if (process.env.NODE_ENV === "production" && !webOrigin) {
    throw new Error("WEB_ORIGIN must be configured in production.");
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
  app.enableCors({
    origin: allowedWebOrigin,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    maxAge: 600,
    credentials: true,
  });
  app.useBodyParser("json", { limit: "8kb" });
  app.use(createSecurityMiddleware());
  const port = Number(process.env.API_PORT ?? 3000);
  const host =
    process.env.API_HOST ??
    (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
  await app.listen(port, host);
  console.log(`Grumphya API listening on http://${host}:${port}/api/health`);
}

void bootstrap();
