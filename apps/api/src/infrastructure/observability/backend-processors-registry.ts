const REGISTRATION_IDS = [
  "openai-evaluation",
  "openai-roast",
  "openai-embedding",
  "openai-idea-fingerprint",
  "openai-idea-equivalence",
  "openai-avatar-moderation",
  "smtp-mail",
] as const;

export type BackendProcessorRegistrationId = (typeof REGISTRATION_IDS)[number];

export type BackendProcessorRegistration = {
  providerId: string;
  displayName: string;
  product: string;
};

export type BackendProcessorRegistrySnapshot = {
  inventoryStatus: "complete" | "incomplete";
  registrations: Array<{
    registrationId: BackendProcessorRegistrationId;
    processor: BackendProcessorRegistration | null;
  }>;
};

const registrations = new Map<
  BackendProcessorRegistrationId,
  BackendProcessorRegistration | null
>();

export function recordBackendProcessorRegistration(
  registrationId: BackendProcessorRegistrationId,
  processor: BackendProcessorRegistration | null,
): void {
  registrations.set(registrationId, processor);
}

export function readBackendProcessorRegistry(): BackendProcessorRegistrySnapshot {
  const complete = REGISTRATION_IDS.every((id) => registrations.has(id));
  const snapshot = REGISTRATION_IDS.map((registrationId) => ({
    registrationId,
    processor: registrations.get(registrationId) ?? null,
  }));
  const unidentifiedExternalProvider = snapshot.some(
    ({ processor }) => processor?.providerId === "smtp-unidentified",
  );
  return {
    inventoryStatus:
      complete && !unidentifiedExternalProvider ? "complete" : "incomplete",
    registrations: snapshot,
  };
}

export function resetBackendProcessorRegistryForTests(): void {
  registrations.clear();
}
