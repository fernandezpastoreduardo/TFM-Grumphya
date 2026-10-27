import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const smtpMocks = vi.hoisted(() => ({
  connectNet: vi.fn(),
  connectTls: vi.fn(),
}));

vi.mock("node:net", () => ({ connect: smtpMocks.connectNet }));
vi.mock("node:tls", () => ({ connect: smtpMocks.connectTls }));

import { SmtpMailTransport, type MailEnvelope } from "./smtp-mail.transport";

const SMTP_SETTINGS = {
  host: "smtp.example.test",
  port: 587,
  username: "mailer@example.test",
  password: "private-password",
  fromAddress: "noreply@example.test",
};

const TEST_MESSAGE: MailEnvelope = {
  to: "person@example.test",
  subject: "Hola, mundo",
  text: "Texto de prueba",
  html: "<p>Texto de prueba</p>",
  replyTo: "support@example.test",
};

class FakeSocket extends EventEmitter {
  readonly writes: string[] = [];
  destroyed = false;

  constructor(
    private readonly responseFor: (
      write: string,
    ) => string | readonly string[] | undefined = defaultResponseFor,
  ) {
    super();
  }

  write(data: string | Uint8Array): boolean {
    const write = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
    this.writes.push(write);
    const responses = this.responseFor(write);
    if (responses) {
      for (const response of Array.isArray(responses)
        ? responses
        : [responses]) {
        queueMicrotask(() => this.emit("data", Buffer.from(response)));
      }
    }
    return true;
  }

  destroy(): this {
    this.destroyed = true;
    return this;
  }
}

function defaultResponseFor(
  write: string,
): string | readonly string[] | undefined {
  if (write.endsWith("\r\n.\r\n")) return "250 2.0.0 Message accepted\r\n";
  const command = write.replace(/\r\n$/, "");
  if (command.startsWith("EHLO ")) {
    return [
      "250-smtp.example.test\r\n250-SIZE",
      " 100000\r\n250 AUTH LOGIN\r\n",
    ];
  }
  if (command === "STARTTLS") return "220 Ready to start TLS\r\n";
  if (command === "AUTH LOGIN") return "334 VXNlcm5hbWU6\r\n";
  if (command === Buffer.from(SMTP_SETTINGS.username).toString("base64")) {
    return "334 UGFzc3dvcmQ6\r\n";
  }
  if (command === Buffer.from(SMTP_SETTINGS.password).toString("base64")) {
    return "235 2.7.0 Authenticated\r\n";
  }
  if (command.startsWith("MAIL FROM:")) return "250 Sender accepted\r\n";
  if (command.startsWith("RCPT TO:")) return "250 Recipient accepted\r\n";
  if (command === "DATA") return "354 End with <CR><LF>.<CR><LF>\r\n";
  if (command === "QUIT") return "221 Bye\r\n";
  return undefined;
}

function connectOnNextTick(socket: FakeSocket): void {
  queueMicrotask(() => {
    socket.emit("connect");
    queueMicrotask(() =>
      socket.emit("data", Buffer.from("220 smtp.example.test ready\r\n")),
    );
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("SmtpMailTransport", () => {
  it("delivers over STARTTLS, authenticates, encodes the message, and closes the socket", async () => {
    const plainSocket = new FakeSocket();
    const secureSocket = new FakeSocket();
    smtpMocks.connectNet.mockImplementation(() => {
      connectOnNextTick(plainSocket);
      return plainSocket;
    });
    smtpMocks.connectTls.mockImplementation(
      (options: { socket?: FakeSocket }) => {
        const socket = options.socket ? secureSocket : new FakeSocket();
        queueMicrotask(() => {
          socket.emit("secureConnect");
          if (!options.socket) {
            queueMicrotask(() =>
              socket.emit(
                "data",
                Buffer.from("220 smtp.example.test ready\r\n"),
              ),
            );
          }
        });
        return socket;
      },
    );

    await new SmtpMailTransport(SMTP_SETTINGS).send(TEST_MESSAGE);

    expect(plainSocket.writes).toEqual([
      "EHLO grumphya.local\r\n",
      "STARTTLS\r\n",
    ]);
    expect(secureSocket.writes).toEqual(
      expect.arrayContaining([
        "EHLO grumphya.local\r\n",
        "AUTH LOGIN\r\n",
        `${Buffer.from(SMTP_SETTINGS.username).toString("base64")}\r\n`,
        `${Buffer.from(SMTP_SETTINGS.password).toString("base64")}\r\n`,
        `MAIL FROM:<${SMTP_SETTINGS.fromAddress}>\r\n`,
        `RCPT TO:<${TEST_MESSAGE.to}>\r\n`,
        "DATA\r\n",
        "QUIT\r\n",
      ]),
    );
    const encodedMessage = secureSocket.writes.find((write) =>
      write.endsWith("\r\n.\r\n"),
    );
    expect(encodedMessage).toContain("Reply-To: support@example.test");
    expect(encodedMessage).toContain("Subject: =?UTF-8?B?");
    expect(encodedMessage).toContain(
      Buffer.from(TEST_MESSAGE.text).toString("base64"),
    );
    expect(encodedMessage).toContain(
      Buffer.from(TEST_MESSAGE.html).toString("base64"),
    );
    expect(plainSocket.destroyed).toBe(true);
  });

  it("uses implicit TLS on port 465 and accepts a forwarded recipient", async () => {
    const secureSocket = new FakeSocket((write) => {
      const response = defaultResponseFor(write);
      if (write.startsWith(`RCPT TO:<${TEST_MESSAGE.to}>`)) {
        return "251 2.1.5 Recipient forwarded\r\n";
      }
      return response;
    });
    smtpMocks.connectTls.mockImplementation(() => {
      queueMicrotask(() => {
        secureSocket.emit("secureConnect");
        queueMicrotask(() =>
          secureSocket.emit(
            "data",
            Buffer.from("220 smtp.example.test ready\r\n"),
          ),
        );
      });
      return secureSocket;
    });

    await new SmtpMailTransport({ ...SMTP_SETTINGS, port: 465 }).send({
      ...TEST_MESSAGE,
      replyTo: undefined,
    });

    expect(smtpMocks.connectNet).not.toHaveBeenCalled();
    expect(smtpMocks.connectTls).toHaveBeenCalledWith({
      host: SMTP_SETTINGS.host,
      port: 465,
      servername: SMTP_SETTINGS.host,
      rejectUnauthorized: true,
      timeout: 10_000,
    });
    const encodedMessage = secureSocket.writes.find((write) =>
      write.endsWith("\r\n.\r\n"),
    );
    expect(encodedMessage).not.toContain("Reply-To:");
    expect(secureSocket.destroyed).toBe(true);
  });

  it("rejects an unexpected SMTP response and still destroys the connection", async () => {
    const socket = new FakeSocket((write) => {
      if (write === "EHLO grumphya.local\r\n") return "550 Not available\r\n";
      return defaultResponseFor(write);
    });
    smtpMocks.connectNet.mockImplementation(() => {
      connectOnNextTick(socket);
      return socket;
    });

    await expect(
      new SmtpMailTransport(SMTP_SETTINGS).send(TEST_MESSAGE),
    ).rejects.toThrow("SMTP server returned status 550.");
    expect(socket.destroyed).toBe(true);
  });

  it("rejects a connection error before an SMTP session starts", async () => {
    const socket = new FakeSocket();
    smtpMocks.connectNet.mockImplementation(() => {
      queueMicrotask(() =>
        socket.emit("error", new Error("connection refused")),
      );
      return socket;
    });

    await expect(
      new SmtpMailTransport(SMTP_SETTINGS).send(TEST_MESSAGE),
    ).rejects.toThrow("connection refused");
    expect(socket.destroyed).toBe(true);
  });

  it("destroys a TCP socket when connecting times out", async () => {
    const socket = new FakeSocket();
    smtpMocks.connectNet.mockImplementation(() => {
      queueMicrotask(() => socket.emit("timeout"));
      return socket;
    });

    await expect(
      new SmtpMailTransport(SMTP_SETTINGS).send(TEST_MESSAGE),
    ).rejects.toThrow("SMTP connection timed out.");
    expect(socket.destroyed).toBe(true);
  });

  it("destroys an implicit TLS socket on connection error or timeout", async () => {
    const erroredSocket = new FakeSocket();
    smtpMocks.connectTls.mockImplementationOnce(() => {
      queueMicrotask(() =>
        erroredSocket.emit("error", new Error("TLS handshake failed")),
      );
      return erroredSocket;
    });

    await expect(
      new SmtpMailTransport({ ...SMTP_SETTINGS, port: 465 }).send(TEST_MESSAGE),
    ).rejects.toThrow("TLS handshake failed");
    expect(erroredSocket.destroyed).toBe(true);

    const timedOutSocket = new FakeSocket();
    smtpMocks.connectTls.mockImplementationOnce(() => {
      queueMicrotask(() => timedOutSocket.emit("timeout"));
      return timedOutSocket;
    });

    await expect(
      new SmtpMailTransport({ ...SMTP_SETTINGS, port: 465 }).send(TEST_MESSAGE),
    ).rejects.toThrow("SMTP connection timed out.");
    expect(timedOutSocket.destroyed).toBe(true);
  });

  it("rejects when the SMTP server closes while a reply is pending", async () => {
    const socketRef: { current?: FakeSocket } = {};
    const socket = new FakeSocket((write) => {
      if (write === "EHLO grumphya.local\r\n") {
        queueMicrotask(() => socketRef.current?.emit("close"));
        return undefined;
      }
      return defaultResponseFor(write);
    });
    socketRef.current = socket;
    smtpMocks.connectNet.mockImplementation(() => {
      connectOnNextTick(socket);
      return socket;
    });

    await expect(
      new SmtpMailTransport(SMTP_SETTINGS).send(TEST_MESSAGE),
    ).rejects.toThrow("SMTP connection closed.");
    expect(socket.destroyed).toBe(true);
  });

  it("rejects a socket error while waiting for an SMTP reply", async () => {
    const socketRef: { current?: FakeSocket } = {};
    const socket = new FakeSocket((write) => {
      if (write === "EHLO grumphya.local\r\n") {
        queueMicrotask(() =>
          socketRef.current?.emit("error", new Error("SMTP peer reset")),
        );
        return undefined;
      }
      return defaultResponseFor(write);
    });
    socketRef.current = socket;
    smtpMocks.connectNet.mockImplementation(() => {
      connectOnNextTick(socket);
      return socket;
    });

    await expect(
      new SmtpMailTransport(SMTP_SETTINGS).send(TEST_MESSAGE),
    ).rejects.toThrow("SMTP peer reset");
    expect(socket.destroyed).toBe(true);
  });
});
