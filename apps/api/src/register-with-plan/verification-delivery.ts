export interface VerificationDelivery {
  deliver(recipient: string, token: string): Promise<void>;
}

export class InMemoryVerificationDelivery implements VerificationDelivery {
  lastToken?: string;
  async deliver(_recipient: string, token: string): Promise<void> {
    this.lastToken = token;
  }
}

const QA_INBOX = "fernandezpastoreduardo@gmail.com";

/** Development-only sink: never sends mail, and never exposes the submitted address. */
export class DevelopmentVerificationDelivery implements VerificationDelivery {
  private latest?: { recipient: string; token: string };

  async deliver(_recipient: string, token: string): Promise<void> {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Development verification delivery is disabled in production.",
      );
    }
    this.latest = { recipient: QA_INBOX, token };
  }

  getLatest(): { token: string } | undefined {
    return this.latest ? { token: this.latest.token } : undefined;
  }
}
