import { authenticatedFetch } from "../../infrastructure/auth/session";

const DELETE_ENDPOINT = "/api/account";

export async function deleteAccount(): Promise<{
  status: number;
  deleted: boolean;
}> {
  const response = await authenticatedFetch(DELETE_ENDPOINT, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const payload: unknown = await response.json().catch(() => null);
  return {
    status: response.status,
    deleted: response.ok && isDeletedResult(payload),
  };
}

function isDeletedResult(value: unknown): value is { deleted: true } {
  return (
    typeof value === "object" &&
    value !== null &&
    "deleted" in value &&
    value.deleted === true
  );
}
