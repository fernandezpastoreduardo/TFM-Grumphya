import { BadRequestException, Injectable } from "@nestjs/common";
import {
  evaluationProcess,
  InvalidEvaluationInputError,
} from "./evaluation-process";

const INVALID_IDEA_RESPONSE = {
  code: "INVALID_IDEA",
  message: "La idea debe tener entre 10 y 800 caracteres.",
};

@Injectable()
export class EvaluationProcessService {
  evaluate(input: unknown) {
    try {
      return evaluationProcess(input);
    } catch (error) {
      if (!(error instanceof InvalidEvaluationInputError)) throw error;
      throw new BadRequestException(INVALID_IDEA_RESPONSE);
    }
  }
}
