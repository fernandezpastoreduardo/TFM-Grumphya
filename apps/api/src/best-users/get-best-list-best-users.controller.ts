import { Controller, Get, Inject } from "@nestjs/common";
import { GetBestListBestUsers } from "./get-best-list-best-users.service";

@Controller("best-users")
export class GetBestListBestUsersController {
  constructor(
    @Inject(GetBestListBestUsers)
    private readonly getBestListBestUsers: GetBestListBestUsers,
  ) {}

  @Get()
  list() {
    return this.getBestListBestUsers.execute();
  }
}
