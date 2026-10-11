import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173" });
  const port = Number(process.env.API_PORT ?? 3000);
  const host =
    process.env.API_HOST ??
    (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
  await app.listen(port, host);
  console.log(`Grumphya API listening on http://${host}:${port}/api/health`);
}

void bootstrap();
