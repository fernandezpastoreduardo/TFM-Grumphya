import {
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
} from "@nestjs/common";
import { GetAccreditation } from "./get-accreditation.service";

@Controller("accreditations")
export class GetAccreditationController {
  constructor(
    @Inject(GetAccreditation)
    private readonly getAccreditation: GetAccreditation,
  ) {}

  @Get(":id")
  @Header("Cache-Control", "no-store")
  get(@Param("id") id: unknown) {
    const accreditation = this.getAccreditation.execute(id);
    if (!accreditation)
      throw new NotFoundException("Acreditación no encontrada.");
    return accreditation;
  }
}
