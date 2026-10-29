import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as speechToText from "../utils/speech-to-text";
import { useSpeechToTextSupport } from "./use-speech-to-text-support";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useSpeechToTextSupport", () => {
  it("detects browser support after the initial render", async () => {
    vi.spyOn(speechToText, "isSpeechToTextSupported").mockReturnValue(true);

    const { result } = renderHook(() => useSpeechToTextSupport());

    await waitFor(() => expect(result.current).toBe(true));
  });
});
