export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Outbound transactional email.
 *
 * A port, not a provider: the domain decides *what* a user must be told and the
 * infrastructure decides how the bytes reach an inbox. The use cases must never
 * learn whether the adapter speaks Resend, SES or SMTP, which is what keeps the
 * SDK out of the domain.
 *
 * Implementations throw `EmailSendError` on failure. They must never throw the
 * token in the error message: an error string ends up in logs, and a log full of
 * live reset tokens is a password reset waiting to happen.
 */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
