import { connect as connectNet, type Socket } from "node:net";
import { connect as connectTls, type TLSSocket } from "node:tls";
import { randomUUID } from "node:crypto";

export type MailEnvelope = {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
};

type MailSettings = {
  host: string;
  port: number;
  username: string;
  password: string;
  fromAddress: string;
};

type SocketLike = Socket | TLSSocket;

export class SmtpMailTransport {
  constructor(private readonly settings: MailSettings) {}

  async send(message: MailEnvelope): Promise<void> {
    const socket = await this.connect();
    try {
      const reader = new SmtpReplyReader(socket);
      await reader.expect([220]);
      await smtpCommand(socket, reader, "EHLO grumphya.local", [250]);
      let activeSocket: SocketLike = socket;
      let activeReader = reader;
      if (this.settings.port !== 465) {
        await smtpCommand(socket, reader, "STARTTLS", [220]);
        reader.detach();
        activeSocket = await upgradeToTls(socket, this.settings.host);
        activeReader = new SmtpReplyReader(activeSocket);
        await smtpCommand(
          activeSocket,
          activeReader,
          "EHLO grumphya.local",
          [250],
        );
      }
      await smtpCommand(activeSocket, activeReader, "AUTH LOGIN", [334]);
      await smtpCommand(
        activeSocket,
        activeReader,
        Buffer.from(this.settings.username).toString("base64"),
        [334],
      );
      await smtpCommand(
        activeSocket,
        activeReader,
        Buffer.from(this.settings.password).toString("base64"),
        [235],
      );
      await smtpCommand(
        activeSocket,
        activeReader,
        `MAIL FROM:<${this.settings.fromAddress}>`,
        [250],
      );
      await smtpCommand(
        activeSocket,
        activeReader,
        `RCPT TO:<${message.to}>`,
        [250, 251],
      );
      await smtpCommand(activeSocket, activeReader, "DATA", [354]);
      activeSocket.write(encodeMessage(message, this.settings.fromAddress));
      await activeReader.expect([250]);
      await smtpCommand(activeSocket, activeReader, "QUIT", [221]).catch(
        () => undefined,
      );
    } finally {
      socket.destroy();
    }
  }

  private connect(): Promise<SocketLike> {
    if (this.settings.port === 465) {
      return new Promise((resolve, reject) => {
        const socket = connectTls({
          host: this.settings.host,
          port: this.settings.port,
          servername: this.settings.host,
          rejectUnauthorized: true,
          timeout: 10_000,
        });
        socket.once("secureConnect", () => resolve(socket));
        socket.once("error", reject);
        socket.once("timeout", () =>
          reject(new Error("SMTP connection timed out.")),
        );
      });
    }
    return new Promise((resolve, reject) => {
      const socket = connectNet({
        host: this.settings.host,
        port: this.settings.port,
        timeout: 10_000,
      });
      socket.once("connect", () => resolve(socket));
      socket.once("error", reject);
      socket.once("timeout", () =>
        reject(new Error("SMTP connection timed out.")),
      );
    });
  }
}

class SmtpReplyReader {
  private pending = "";
  private readonly waiters: Array<{
    resolve: (reply: string) => void;
    reject: (error: Error) => void;
  }> = [];
  private readonly onData = (chunk: Buffer) => {
    this.pending += chunk.toString("utf8");
    this.resolveReplies();
  };
  private readonly onError = (error: Error) => this.rejectWaiters(error);
  private readonly onClose = () =>
    this.rejectWaiters(new Error("SMTP connection closed."));
  constructor(private readonly socket: SocketLike) {
    socket.on("data", this.onData);
    socket.on("error", this.onError);
    socket.on("close", this.onClose);
  }
  detach(): void {
    this.socket.off("data", this.onData);
    this.socket.off("error", this.onError);
    this.socket.off("close", this.onClose);
  }
  expect(codes: readonly number[]): Promise<string> {
    const reply = this.takeReply();
    return reply
      ? Promise.resolve(verifyReply(reply, codes))
      : new Promise((resolve, reject) => {
          this.waiters.push({
            resolve: (value) => {
              try {
                resolve(verifyReply(value, codes));
              } catch (error) {
                reject(error);
              }
            },
            reject,
          });
        });
  }
  private resolveReplies(): void {
    while (this.waiters.length > 0) {
      const reply = this.takeReply();
      if (!reply) return;
      this.waiters.shift()!.resolve(reply);
    }
  }
  private takeReply(): string | undefined {
    const lines = this.pending.split("\r\n");
    if (lines.length < 2) return undefined;
    const complete: string[] = [];
    let consumed = 0;
    for (const line of lines) {
      consumed += line.length + 2;
      if (!line) break;
      complete.push(line);
      if (/^\d{3} /.test(line)) {
        this.pending = this.pending.slice(consumed);
        return complete.join("\n");
      }
    }
    return undefined;
  }
  private rejectWaiters(error: Error): void {
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
  }
}

function verifyReply(reply: string, expectedCodes: readonly number[]): string {
  const code = Number(reply.slice(0, 3));
  if (!expectedCodes.includes(code))
    throw new Error(`SMTP server returned status ${code}.`);
  return reply;
}

async function smtpCommand(
  socket: SocketLike,
  reader: SmtpReplyReader,
  command: string,
  expectedCodes: readonly number[],
): Promise<string> {
  const response = reader.expect(expectedCodes);
  socket.write(`${command}\r\n`);
  return response;
}

function upgradeToTls(socket: Socket, host: string): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const secureSocket = connectTls({
      socket,
      servername: host,
      rejectUnauthorized: true,
      timeout: 10_000,
    });
    secureSocket.once("secureConnect", () => resolve(secureSocket));
    secureSocket.once("error", reject);
  });
}

function encodeMessage(message: MailEnvelope, fromAddress: string): string {
  const subject = `=?UTF-8?B?${Buffer.from(message.subject, "utf8").toString("base64")}?=`;
  const boundary = `grumphya_${randomUUID().replace(/-/g, "")}`;
  const text =
    Buffer.from(message.text, "utf8")
      .toString("base64")
      .match(/.{1,76}/g)
      ?.join("\r\n") ?? "";
  const html =
    Buffer.from(message.html, "utf8")
      .toString("base64")
      .match(/.{1,76}/g)
      ?.join("\r\n") ?? "";
  const headers = [
    `From: Grumphya <${fromAddress}>`,
    `To: <${message.to}>`,
    `Subject: ${subject}`,
    ...(message.replyTo ? [`Reply-To: ${message.replyTo}`] : []),
    `Message-ID: <${randomUUID()}@grumphya.local>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  return [
    ...headers,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    text,
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    html,
    `--${boundary}--`,
    ".",
    "",
  ].join("\r\n");
}
