function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readOpenAiOutputText(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.output)) return null;
  for (const outputItem of value.output as unknown[]) {
    if (!isRecord(outputItem) || !Array.isArray(outputItem.content)) continue;
    for (const contentItem of outputItem.content as unknown[]) {
      if (
        isRecord(contentItem) &&
        contentItem.type === "output_text" &&
        typeof contentItem.text === "string"
      ) {
        return contentItem.text;
      }
    }
  }
  return null;
}
