import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TranscriptUserIdea } from "./transcript-user-idea";
import * as speechToText from "../../shared/utils/speech-to-text";

const MICROPHONE_BUTTON = /dictar idea/i;
const TRANSCRIBED_TEXT = "Una aplicación para compartir libros";
const PERMISSION_ERROR_MESSAGE = /permiso al micrófono/i;

describe("TranscriptUserIdea", () => {
  afterEach(() => vi.restoreAllMocks());

  it("starts dictation and sends recognized text to the input", async () => {
    const user = userEvent.setup();
    const onTranscript = vi.fn();
    const stop = vi.fn();
    vi.spyOn(speechToText, "startSpeechToText").mockImplementation(
      ({ onTranscript: receiveTranscript }) => {
        receiveTranscript(TRANSCRIBED_TEXT);
        return { stop };
      },
    );
    render(<TranscriptUserIdea onTranscript={onTranscript} />);

    await user.click(screen.getByRole("button", { name: MICROPHONE_BUTTON }));

    expect(onTranscript).toHaveBeenCalledWith(TRANSCRIBED_TEXT);
    expect(screen.getByRole("status")).toHaveTextContent(/escuchando/i);
  });

  it("shows a clear permission failure and keeps manual entry available", async () => {
    const user = userEvent.setup();
    vi.spyOn(speechToText, "startSpeechToText").mockImplementation(
      ({ onError }) => {
        onError("permission-denied");
        return null;
      },
    );
    render(<TranscriptUserIdea onTranscript={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: MICROPHONE_BUTTON }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      PERMISSION_ERROR_MESSAGE,
    );
    expect(
      screen.getByRole("button", { name: MICROPHONE_BUTTON }),
    ).toBeEnabled();
  });

  it("returns to idle when the browser finishes listening", async () => {
    const user = userEvent.setup();
    let finishListening: (() => void) | undefined;
    vi.spyOn(speechToText, "startSpeechToText").mockImplementation(
      ({ onEnd }) => {
        finishListening = onEnd;
        return { stop: vi.fn() };
      },
    );
    render(<TranscriptUserIdea onTranscript={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: MICROPHONE_BUTTON }));
    expect(screen.getByRole("status")).toBeVisible();
    act(() => finishListening?.());

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: MICROPHONE_BUTTON }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("stops recognition when the component unmounts", async () => {
    const user = userEvent.setup();
    const stop = vi.fn();
    vi.spyOn(speechToText, "startSpeechToText").mockReturnValue({ stop });
    const { unmount } = render(<TranscriptUserIdea onTranscript={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: MICROPHONE_BUTTON }));

    unmount();

    expect(stop).toHaveBeenCalledOnce();
  });
});
