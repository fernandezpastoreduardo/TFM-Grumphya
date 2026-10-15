import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GetUserIdea } from "./get-user-idea";
import { MAX_IDEA_LENGTH } from "./idea-input-rules";
import * as speechToText from "../../shared/utils/speech-to-text";

const VALID_IDEA = "Una aplicación para organizar los turnos de una clínica";
const CLIPBOARD_IDEA = "Una app para compartir herramientas entre vecinos";
const UNSAFE_ERROR_TEXT = '<script>alert("xss")</script>';
const INPUT_LABEL = /qué aplicación tienes en mente/i;
const SUBMIT_LABEL = /^evaluar idea/i;
const MICROPHONE_BUTTON_LABEL = /dictar idea/i;
const PERMISSION_DENIED_MESSAGE = /permiso al micrófono/i;

describe("GetUserIdea", () => {
  it("sends trimmed text and the selected tone when submitted", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<GetUserIdea onSubmit={onSubmit} />);

    await user.type(
      screen.getByRole("textbox", { name: INPUT_LABEL }),
      `  ${VALID_IDEA}  `,
    );
    await user.click(screen.getByRole("button", { name: SUBMIT_LABEL }));

    expect(onSubmit).toHaveBeenCalledWith({
      ideaText: VALID_IDEA,
      tone: "soft",
    });
  });

  it("accepts text pasted from the clipboard", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<GetUserIdea onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox", { name: INPUT_LABEL });

    await user.click(input);
    await user.paste(CLIPBOARD_IDEA);
    await user.click(screen.getByRole("button", { name: SUBMIT_LABEL }));

    expect(onSubmit).toHaveBeenCalledWith({
      ideaText: CLIPBOARD_IDEA,
      tone: "soft",
    });
  });

  it("adds dictated text to the editable idea without replacing existing text", async () => {
    const user = userEvent.setup();
    const inputCallback = vi.spyOn(speechToText, "startSpeechToText");
    inputCallback.mockImplementation(({ onTranscript }) => {
      onTranscript("y compartir libros entre vecinos");
      return { stop: vi.fn() };
    });
    render(<GetUserIdea onSubmit={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: INPUT_LABEL });

    await user.type(input, "Una aplicación para");
    await user.click(
      screen.getByRole("button", { name: MICROPHONE_BUTTON_LABEL }),
    );

    expect(input).toHaveValue(
      "Una aplicación para y compartir libros entre vecinos",
    );
    expect(input).toHaveAttribute("maxLength", String(MAX_IDEA_LENGTH));
  });

  it("keeps dictated text within the maximum idea length", async () => {
    const user = userEvent.setup();
    vi.spyOn(speechToText, "startSpeechToText").mockImplementation(
      ({ onTranscript }) => {
        onTranscript(" and then some more words");
        return { stop: vi.fn() };
      },
    );
    render(<GetUserIdea onSubmit={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: INPUT_LABEL });
    await user.click(input);
    await user.paste("a".repeat(MAX_IDEA_LENGTH - 5));

    await user.click(
      screen.getByRole("button", { name: MICROPHONE_BUTTON_LABEL }),
    );

    expect(input).toHaveValue(`${"a".repeat(MAX_IDEA_LENGTH - 5)} and `);
  });

  it("preserves typed text and keeps editing available when microphone access is denied", async () => {
    const user = userEvent.setup();
    vi.spyOn(speechToText, "startSpeechToText").mockImplementation(
      ({ onError }) => {
        onError("permission-denied");
        return null;
      },
    );
    render(<GetUserIdea onSubmit={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: INPUT_LABEL });
    await user.type(input, "Una idea que ya estaba escrita");

    await user.click(
      screen.getByRole("button", { name: MICROPHONE_BUTTON_LABEL }),
    );

    expect(input).toHaveValue("Una idea que ya estaba escrita");
    expect(input).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      PERMISSION_DENIED_MESSAGE,
    );
  });

  it("blocks empty or whitespace-only input with an accessible message", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<GetUserIdea onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: SUBMIT_LABEL }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/hay aire/i);

    await user.type(
      screen.getByRole("textbox", { name: INPUT_LABEL }),
      "     ",
    );
    await user.click(screen.getByRole("button", { name: SUBMIT_LABEL }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeVisible();
  });

  it("requires at least 10 characters and limits input to 2,000 characters", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<GetUserIdea onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox", { name: INPUT_LABEL });

    await user.type(input, "demasiado");
    await user.click(screen.getByRole("button", { name: SUBMIT_LABEL }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /al menos 10 caracteres/i,
    );

    await user.clear(input);
    await user.type(input, "a".repeat(MAX_IDEA_LENGTH + 1));
    expect(input).toHaveValue("a".repeat(MAX_IDEA_LENGTH));
    expect(input).toHaveAttribute("maxLength", String(MAX_IDEA_LENGTH));
  });

  it("treats markup as literal user text and never renders it as HTML", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const unsafeLookingText = '<img src=x onerror="alert(1)">';
    render(<GetUserIdea onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox", { name: INPUT_LABEL });

    await user.type(input, unsafeLookingText);
    expect(document.querySelector("img")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: SUBMIT_LABEL }));

    expect(onSubmit).toHaveBeenCalledWith({
      ideaText: unsafeLookingText,
      tone: "soft",
    });
    expect(document.querySelector("img")).not.toBeInTheDocument();
  });

  it("renders untrusted error copy as text rather than executable markup", () => {
    render(<GetUserIdea onSubmit={vi.fn()} error={UNSAFE_ERROR_TEXT} />);

    expect(screen.getByRole("alert")).toHaveTextContent(UNSAFE_ERROR_TEXT);
    expect(document.querySelector("script")).not.toBeInTheDocument();
  });

  it("allows changing presentation tone without altering the captured idea", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<GetUserIdea onSubmit={onSubmit} />);

    await user.type(
      screen.getByRole("textbox", { name: INPUT_LABEL }),
      VALID_IDEA,
    );
    await user.click(
      screen.getByRole("radio", { name: /dame tu mejor golpe/i }),
    );
    await user.click(screen.getByRole("button", { name: SUBMIT_LABEL }));

    expect(onSubmit).toHaveBeenCalledWith({
      ideaText: VALID_IDEA,
      tone: "hard",
    });
  });

  it("supports keyboard submission and disables submission while busy", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { rerender } = render(<GetUserIdea onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox", { name: INPUT_LABEL });
    await user.click(input);
    await user.type(input, VALID_IDEA);
    await user.tab();
    expect(
      screen.getByRole("button", { name: MICROPHONE_BUTTON_LABEL }),
    ).toHaveFocus();
    await user.tab();
    expect(
      screen.getByRole("radio", { name: /tengo la piel fina/i }),
    ).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: SUBMIT_LABEL })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);

    rerender(<GetUserIdea onSubmit={onSubmit} isSubmitting />);
    expect(screen.getByRole("button", { name: /evaluando/i })).toBeDisabled();
  });

  it("does not persist or send captured text on its own", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const onSubmit = vi.fn();
    render(<GetUserIdea onSubmit={onSubmit} />);

    await user.type(
      screen.getByRole("textbox", { name: INPUT_LABEL }),
      VALID_IDEA,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    fetchSpy.mockRestore();
  });
});
