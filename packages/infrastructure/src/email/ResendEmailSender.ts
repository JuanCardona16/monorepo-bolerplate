import { EmailSendError, type EmailMessage, type EmailSender } from "@repo/core/authentication";

export interface ResendEmailSenderOptions {
  apiKey: string;
  from: string;
  /** Injected so tests never touch the network. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Injection point for the failure log, so tests can assert on it. */
  onFailure?: (recipient: string, detail: string) => void;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Transactional email over Resend's REST API, with `fetch` and no SDK.
 *
 * The API is a single authenticated POST. A dependency for one HTTP call would
 * add install weight, a transitive tree and a postinstall surface to a repo that
 * already had to block one for telemetry, and the response shape we need is two
 * fields. The `EmailSender` port is what keeps the domain honest here: it is
 * the adapter that knows about Resend, not the use case.
 */
export class ResendEmailSender implements EmailSender {
  private readonly fetchImpl: typeof fetch;
  private readonly onFailure: (recipient: string, detail: string) => void;

  constructor(private readonly options: ResendEmailSenderOptions) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.onFailure = options.onFailure ?? defaultFailureLog;
  }

  async send(message: EmailMessage): Promise<void> {
    const body = {
      from: this.options.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      ...(message.html === undefined ? {} : { html: message.html }),
    };

    let response: Response;
    try {
      response = await this.fetchImpl(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      // Nothing about the request is logged here, and nothing about it in the
      // message either. The body carries a live reset token, and an error
      // string ends up in logs, so including it would put a working password
      // reset credential into whatever aggregates them.
      this.onFailure(message.to, "network");
      throw new EmailSendError("The email provider could not be reached.", cause);
    }

    if (!response.ok) {
      this.onFailure(message.to, `status-${response.status}`);
      throw new EmailSendError(`The email provider rejected the message (${response.status}).`);
    }
  }
}

/**
 * The recipient and the failure class, and nothing else.
 *
 * The recipient is what makes the line actionable: "resend failed" tells an
 * operator nothing, while "resend failed for three recipients in a minute"
 * does. The token is what must never appear, so it cannot.
 */
function defaultFailureLog(recipient: string, detail: string): void {
  console.error(`[email] delivery failed for ${recipient} (${detail}).`);
}
