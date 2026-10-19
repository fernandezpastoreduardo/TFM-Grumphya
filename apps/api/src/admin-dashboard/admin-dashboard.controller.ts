import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { AccessTokenGuard } from "../infrastructure/auth/access-token.guard";
import { AdminRoleGuard } from "./admin-role.guard";
import { AdminDashboardService } from "./admin-dashboard.service";

@Controller("admin")
@UseGuards(AccessTokenGuard, AdminRoleGuard)
export class AdminDashboardController {
  constructor(
    @Inject(AdminDashboardService)
    private readonly dashboard: AdminDashboardService,
  ) {}

  @Get("dashboard")
  getDashboard() {
    return this.dashboard.getSnapshot();
  }

  @Get("contact-messages")
  listContactMessages() {
    return this.dashboard.listContactMessages();
  }
}
