import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetUserIdea } from "./get-user-idea";
import { MAX_IDEA_LENGTH } from "./idea-input-rules";
import * as speechToText from "../../shared/utils/speech-to-text";

const VALID_IDEA = "Una aplicación para organizar los turnos de una clínica";
const CLIPBOARD_IDEA = "Una app para compartir herramientas entre vecinos";
const UNSAFE_ERROR_TEXT = '<script>alert("xss")</script>';
const INPUT_LABEL = /escribe, pega o dicta tu idea/i;
const INPUT_LABEL_WITHOUT_DICTATION = /escribe o pega tu idea/i;
const NEXT_STEP_LABEL = /^adelante$/i;
const BACK_TO_IDEA_LABEL = /cambiar idea/i;
const SUBMIT_LABEL = /^evaluar idea/i;
const MICROPHONE_BUTTON_LABEL = /dictar idea/i;
const PERMISSION_DENIED_MESSAGE = /permiso al micrófono/i;

async function continueToToneStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: NEXT_STEP_LABEL }));
}

describe("GetUserIdea", () => {
  beforeEach(() => {
    vi.spyOn(speechToText, "isSpeechToTextSupported").mockReturnValue(true);
  });

  it("shows the idea step first, validates it, and advances to tone selection", async () => {
    const user = userEvent.setup();
    render(<GetUserIdea onSubmit={vi.fn()} />);

    expect(screen.getByRole("textbox", { name: INPUT_LABEL })).toBeVisible();
    expect(
      screen.queryByRole("radio", { name: /tengo la piel fina/i }),
    ).not.toBeInTheDocument();

    await continueToToneStep(user);
    expect(screen.getByRole("alert")).toHaveTextContent(/hay aire/i);

    await user.type(
      screen.getByRole("textbox", { name: INPUT_LABEL }),
      VALID_IDEA,
    );
    await continueToToneStep(user);

    expect(
      screen.getByRole("radio", { name: /tengo la piel fina/i }),
    ).toBeVisible();
    expect(
      screen.getByText("Con corazones, confeti y muchísimo cariño."),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Sin azúcar: critico la idea, nunca a quien la propone.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole("textbox", { name: INPUT_LABEL }),
    ).not.toBeInTheDocument();
  });

  it("uses the no-dictation label and clears text with the close button", async () => {
    const user = userEvent.setup();
    vi.spyOn(speechToText, "isSpeechToTextSupported").mockReturnValue(false);
    render(<GetUserIdea onSubmit={vi.fn()} />);

    const ideaInput = screen.getByRole("textbox", {
      name: INPUT_LABEL_WITHOUT_DICTATION,
    });
    expect(
      screen.queryByRole("button", { name: MICROPHONE_BUTTON_LABEL }),
    ).not.toBeInTheDocument();

    await user.type(ideaInput, VALID_IDEA);
    await user.click(screen.getByRole("button", { name: /borrar idea/i }));

    expect(ideaInput).toHaveValue("");
  });

  it("returns to the idea step without losing text or the selected tone", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<GetUserIdea onSubmit={onSubmit} />);
    const ideaInput = screen.getByRole("textbox", { name: INPUT_LABEL });
    await user.type(ideaInput, VALID_IDEA);
    await continueToToneStep(user);
    await user.click(
      screen.getByRole("radio", { name: /dame tu mejor golpe/i }),
    );
    await user.click(screen.getByRole("button", { name: BACK_TO_IDEA_LABEL }));

    expect(screen.getByRole("textbox", { name: INPUT_LABEL })).toHaveValue(
      VALID_IDEA,
    );
    await continueToToneStep(user);
    await user.click(screen.getByRole("button", { name: SUBMIT_LABEL }));

    expect(onSubmit).toHaveBeenCalledWith({
      ideaText: VALID_IDEA,
      tone: "hard",
    });
    expect(
      screen.getByRole("radio", { name: /dame tu mejor golpe/i }),
    ).toBeChecked();
    expect(
      screen.queryByRole("textbox", { name: INPUT_LABEL }),
    ).not.toBeInTheDocument();
  });

  it("returns to the idea step when the parent resets the step key", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <GetUserIdea onSubmit={vi.fn()} stepResetKey={0} />,
    );
    const ideaInput = screen.getByRole("textbox", { name: INPUT_LABEL });
    await user.type(ideaInput, VALID_IDEA);
    await continueToToneStep(user);
    expect(
      screen.getByRole("radio", { name: /tengo la piel fina/i }),
    ).toBeVisible();

    rerender(<GetUserIdea onSubmit={vi.fn()} stepResetKey={1} />);

    expect(screen.getByRole("textbox", { name: INPUT_LABEL })).toHaveValue(
      VALID_IDEA,
    );
    expect(
      screen.queryByRole("radio", { name: /tengo la piel fina/i }),
    ).not.toBeInTheDocument();
  });

  it("sends trimmed text and the selected tone when submitted", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<GetUserIdea onSubmit={onSubmit} />);

    await user.type(
      screen.getByRole("textbox", { name: INPUT_LABEL }),
      `  ${VALID_IDEA}  `,
    );
    await continueToToneStep(user);
    await user.click(screen.getByRole("button", { name: SUBMIT_LABEL }));

    expect(onSubmit).toHaveBeenCalledWith({
      ideaText: VALID_IDEA,
      tone: "soft",
    });
  });

  it("opens the exhausted-guest flow instead of submitting an idea", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onQuotaExhausted = vi.fn();
    render(
      <GetUserIdea
        onSubmit={onSubmit}
        onQuotaExhausted={onQuotaExhausted}
        remainingAttempts={0}
      />,
    );
    await user.type(
      screen.getByRole("textbox", { name: INPUT_LABEL }),
      VALID_IDEA,
    );
    await continueToToneStep(user);

    const submitButton = screen.getByRole("button", { name: SUBMIT_LABEL });
    expect(submitButton).toBeEnabled();
    await user.click(submitButton);

    expect(onQuotaExhausted).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows the server-managed daily quota for an account plan", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <GetUserIdea
        onSubmit={onSubmit}
        quotaKind="account"
        remainingAttempts={4}
      />,
    );

    expect(
      screen.getByText(/te quedan 4 de 11 evaluaciones disponibles hoy/i),
    ).toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: INPUT_LABEL }),
      VALID_IDEA,
    );
    await continueToToneStep(user);
    await user.click(screen.getByRole("button", { name: SUBMIT_LABEL }));

    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("leaves an exhausted account request to server validation", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onQuotaExhausted = vi.fn();
    render(
      <GetUserIdea
        onSubmit={onSubmit}
        onQuotaExhausted={onQuotaExhausted}
        quotaKind="account"
        remainingAttempts={0}
      />,
    );

    expect(
      screen.getByText(/has agotado las 11 evaluaciones disponibles hoy/i),
    ).toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: INPUT_LABEL }),
      VALID_IDEA,
    );
    await continueToToneStep(user);
    await user.click(screen.getByRole("button", { name: SUBMIT_LABEL }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onQuotaExhausted).not.toHaveBeenCalled();
  });

  it("accepts text pasted from the clipboard", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<GetUserIdea onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox", { name: INPUT_LABEL });

    await user.click(input);
    await user.paste(CLIPBOARD_IDEA);
    await continueToToneStep(user);
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
      await screen.findByRole("button", { name: MICROPHONE_BUTTON_LABEL }),
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
      await screen.findByRole("button", { name: MICROPHONE_BUTTON_LABEL }),
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
      await screen.findByRole("button", { name: MICROPHONE_BUTTON_LABEL }),
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

    await continueToToneStep(user);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/hay aire/i);

    await user.type(
      screen.getByRole("textbox", { name: INPUT_LABEL }),
      "     ",
    );
    await continueToToneStep(user);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeVisible();
  });

  it("requires at least 10 characters and limits input to 2,000 characters", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<GetUserIdea onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox", { name: INPUT_LABEL });

    await user.type(input, "demasiado");
    await continueToToneStep(user);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /al menos 10 caracteres/i,
    );

    await user.clear(input);
    await user.type(input, "a".repeat(MAX_IDEA_LENGTH + 1));
    expect(input).toHaveValue("a".repeat(MAX_IDEA_LENGTH));
    expect(input).toHaveAttribute("maxLength", String(MAX_IDEA_LENGTH));
  }, 15_000);

  it("treats markup as literal user text and never renders it as HTML", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const unsafeLookingText = '<img src=x onerror="alert(1)">';
    render(<GetUserIdea onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox", { name: INPUT_LABEL });

    fireEvent.change(input, { target: { value: unsafeLookingText } });
    expect(document.querySelector("img")).not.toBeInTheDocument();
    await continueToToneStep(user);
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
    await continueToToneStep(user);
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
    await screen.findByRole("button", { name: MICROPHONE_BUTTON_LABEL });
    const input = screen.getByRole("textbox", { name: INPUT_LABEL });
    await user.click(input);
    await user.type(input, VALID_IDEA);
    await user.tab();
    expect(
      screen.getByRole("button", { name: MICROPHONE_BUTTON_LABEL }),
    ).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: /borrar idea/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: NEXT_STEP_LABEL })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("radio", { name: /tengo la piel fina/i }),
    ).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(
      screen.getByRole("radio", { name: /dame tu mejor golpe/i }),
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
