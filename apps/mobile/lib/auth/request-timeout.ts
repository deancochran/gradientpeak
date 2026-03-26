const AUTH_REQUEST_TIMEOUT_MS = 10000;

export class AuthRequestTimeoutError extends Error {
  constructor() {
    super("Request timed out");
    this.name = "AuthRequestTimeoutError";
  }
}

export function withAuthRequestTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new AuthRequestTimeoutError()), AUTH_REQUEST_TIMEOUT_MS);
    }),
  ]);
}

export function getAuthRequestTimeoutMessage() {
  return "The authentication service is not responding. Check your server configuration and try again.";
}
