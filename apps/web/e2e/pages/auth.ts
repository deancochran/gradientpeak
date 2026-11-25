import { type Page, test } from "@playwright/test";

type Credentials = { email: string; password: string };

export class AuthPage {
  constructor(readonly page: Page) {}

  async waitForHydration() {
    await this.page.locator('body > div[aria-busy="false"]').waitFor();
  }

  async openLogin(redirect?: string) {
    const query = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
    await this.page.goto(`/auth/login${query}`);
    await this.waitForHydration();
  }

  async fillLogin(credentials: Credentials) {
    await this.waitForHydration();
    await this.page.getByLabel(/^email/i).fill(credentials.email);
    await this.page.getByLabel(/^password/i).fill(credentials.password);
  }

  async submitLogin(input: "click" | "keyboard" = "click") {
    const submit = this.page.getByRole("button", { name: /^login$/i });
    if (input === "keyboard") await submit.press("Enter");
    else await submit.click();
  }

  async signIn(credentials: Credentials, input: "click" | "keyboard" = "click") {
    await test.step("Sign in", async () => {
      await this.fillLogin(credentials);
      await this.submitLogin(input);
    });
  }

  async signUp(credentials: Credentials) {
    await test.step("Submit sign-up form", async () => {
      await this.page.goto("/auth/sign-up");
      await this.waitForHydration();
      await this.page.getByLabel(/^email/i).fill(credentials.email);
      await this.page.getByLabel(/^password/i).fill(credentials.password);
      await this.page.getByLabel(/repeat password/i).fill(credentials.password);
      await this.page.getByRole("button", { name: /^sign up$/i }).click();
    });
  }

  async requestPasswordReset(email: string) {
    await this.page.goto("/auth/forgot-password");
    await this.waitForHydration();
    await this.page.getByLabel(/^email/i).fill(email);
    await this.page.getByRole("button", { name: /send reset email/i }).click();
  }

  async resetPassword(actionUrl: string, password: string, confirmation = password) {
    await this.page.goto(actionUrl);
    await this.waitForHydration();
    await this.page.getByLabel(/^new password/i).fill(password);
    await this.page.getByLabel(/^confirm password/i).fill(confirmation);
    await this.page.getByRole("button", { name: /save new password/i }).click();
  }

  async completeProfile(
    input: { fullName: string; username: string },
    submit: "click" | "keyboard" = "click",
  ) {
    await this.waitForHydration();
    await this.page.getByLabel("Full name").fill(input.fullName);
    await this.page.getByLabel("Username").fill(input.username);
    const finish = this.page.getByRole("button", { name: "Finish setup" });
    if (submit === "keyboard") await finish.press("Enter");
    else await finish.click();
  }

  async signOut(input: "click" | "keyboard" = "click") {
    const button = this.page.getByRole("button", { name: "Sign Out", exact: true });
    if (input === "keyboard") await button.press("Enter");
    else await button.click();
  }
}
