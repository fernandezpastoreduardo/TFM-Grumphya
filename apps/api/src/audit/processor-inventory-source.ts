import {
  readBackendProcessorRegistry,
  type BackendProcessorRegistration,
} from "../infrastructure/observability/backend-processors-registry";
import { applyProcessorDisclosure } from "./processor-inventory-policy";
import type { ProcessorInventorySourceResult } from "./processor-inventory.models";

function groupActiveRegistrations(
  registrations: Array<{
    registrationId: string;
    processor: BackendProcessorRegistration | null;
  }>,
): ProcessorInventorySourceResult["processors"] {
  const byProvider = new Map<
    string,
    { displayName: string; products: Set<string> }
  >();
  for (const { processor } of registrations) {
    if (!processor) continue;
    const existing = byProvider.get(processor.providerId);
    if (existing) {
      if (existing.displayName !== processor.displayName) continue;
      existing.products.add(processor.product);
      continue;
    }
    byProvider.set(processor.providerId, {
      displayName: processor.displayName,
      products: new Set([processor.product]),
    });
  }

  return [...byProvider.entries()]
    .map(([providerId, provider]) =>
      applyProcessorDisclosure(
        providerId,
        provider.displayName,
        [...provider.products].sort().join(", "),
      ),
    )
    .sort((left, right) =>
      left.providerId < right.providerId
        ? -1
        : left.providerId > right.providerId
          ? 1
          : 0,
    );
}

export function collectProcessorInventorySource(): ProcessorInventorySourceResult {
  const registry = readBackendProcessorRegistry();
  return {
    inventoryStatus: registry.inventoryStatus,
    processors: groupActiveRegistrations(registry.registrations),
  };
}
