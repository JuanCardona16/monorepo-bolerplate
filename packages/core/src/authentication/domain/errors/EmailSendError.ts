/**
 * A delivery attempt to the transactional email provider failed.
 *
 * It carries a `code` so the gateway can map it like any other domain error
 * (see `httpStatusMap.ts`). The `forgot` use case deliberately **catches** it
 * instead of propagating it, because a thrown error would turn the provider's
 * health into an account-existence oracle: the caller would get a different
 * answer for a real address than for an unknown one, which is precisely what
 * the silent-response decision exists to prevent. The code is still mapped so
 * that a delivery failure surfacing anywhere else is a 502 and not a 500.
 */
export class EmailSendError extends Error {
  readonly code: string;

  constructor(message: string = "The email could not be sent.", cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = new.target.name;
    this.code = "EMAIL_SEND_FAILED";
  }
}
