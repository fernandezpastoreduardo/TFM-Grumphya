import { Controller, Get } from "@nestjs/common";

@Controller("test-ready")
export class EvaluationTestReadinessController {
  @Get()
  check() {
    return { ready: true };
  }
}
