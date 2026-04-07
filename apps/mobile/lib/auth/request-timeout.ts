// Better Auth Expo can spend additional time processing auth cookies/session state
// after the HTTP response returns, especially over device-to-local-network flows.
// Keep this comfortably above the observed sign-in + session hydration time.
const AUTH_REQUEST_TIMEOUT_MS = 20000;

export class AuthRequestTimeoutError extends Error {
  constructor() {
    super("Request timed out");
    this.name = "AuthRequestTimeoutError";
  }
}

export function withAuthRequestTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(
      () => reject(new AuthRequestTimeoutError()),
      AUTH_REQUEST_TIMEOUT_MS,
    );

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export function getAuthRequestTimeoutMessage() {
  return "The authentication service is not responding. Check your server configuration and try again.";
}
