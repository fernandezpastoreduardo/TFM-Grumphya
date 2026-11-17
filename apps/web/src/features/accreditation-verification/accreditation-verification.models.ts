import type {
  AccreditationRecord,
  AccreditationStatus,
} from "../../shared/accreditation-verification";

export type VerificationState =
  | { kind: "loading" }
  | { kind: "success"; record: AccreditationRecord }
  | { kind: "error" };

export type { AccreditationRecord, AccreditationStatus };
