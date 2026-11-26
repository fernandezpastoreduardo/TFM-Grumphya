import { containsEmailAddress } from "../../shared/utils/email-address";
import {
  MAX_PUBLIC_PRODUCT_EXAMPLE_LENGTH,
  MIN_PUBLIC_PRODUCT_EXAMPLE_LENGTH,
  PUBLIC_CONTROL_PATTERN,
  PUBLIC_PHONE_PATTERN,
  PUBLIC_URL_PATTERN,
  SAFE_PUBLIC_PRODUCT_EXAMPLE_PATTERN,
} from "./evaluation.constants";
import type { EvaluationStatus } from "./evaluation.models";

export function getPublicExistingProductExample(
  value: unknown,
  status: EvaluationStatus,
): string | undefined {
  if (
    status !== "RECHAZADA" ||
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < MIN_PUBLIC_PRODUCT_EXAMPLE_LENGTH ||
    value.length > MAX_PUBLIC_PRODUCT_EXAMPLE_LENGTH ||
    value.toLowerCase() === "null" ||
    value.toLowerCase() === "undefined" ||
    !SAFE_PUBLIC_PRODUCT_EXAMPLE_PATTERN.test(value) ||
    containsEmailAddress(value) ||
    PUBLIC_URL_PATTERN.test(value) ||
    PUBLIC_PHONE_PATTERN.test(value) ||
    PUBLIC_CONTROL_PATTERN.test(value)
  ) {
    return undefined;
  }
  return value;
}
