import type { Request } from "express";

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const item of header.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(value.join("="));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
