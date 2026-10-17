import { Controller, Get, Inject } from "@nestjs/common";
import { GetIdeaListWorstAll } from "./get-idea-list-worst-all.service";

@Controller("worst-ideas")
export class GetIdeaListWorstAllController {
  constructor(
    @Inject(GetIdeaListWorstAll)
    private readonly getIdeaListWorstAll: GetIdeaListWorstAll,
  ) {}

  @Get()
  list() {
    return this.getIdeaListWorstAll.execute();
  }
}
