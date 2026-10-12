// A refusal that a handler turns into an HTTP status. Server functions throw it
// so the rules stay in one place and handlers stay thin.
export class RequestError extends Error {
  constructor(
    public status: 400 | 403 | 404,
    message: string,
  ) {
    super(message);
  }
}
