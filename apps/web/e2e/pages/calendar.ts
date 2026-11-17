import { expect, type Page, test } from "@playwright/test";

const eventIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CalendarEventInput = {
  date: string;
  title: string;
  allDay?: boolean;
  notes?: string;
  repeat?: boolean;
};

export class CalendarPage {
  constructor(readonly page: Page) {}

  async openDay(date: string, input: { month?: string; view?: string } = {}) {
    const query = new URLSearchParams();
    if (input.month) query.set("month", input.month);
    if (input.view) query.set("view", input.view);
    await this.page.goto(`/calendar/day/${date}${query.size ? `?${query}` : ""}`);
  }

  async openDetail(eventId: string) {
    await this.page.goto(`/calendar/events/${eventId}`);
  }

  async openEdit(eventId: string) {
    await this.page.goto(`/calendar/events/${eventId}/edit`);
    await expect(this.page.getByRole("heading", { name: /edit event/i })).toBeVisible();
  }

  async createEvent(input: CalendarEventInput) {
    return test.step(`Create calendar event: ${input.title}`, async () => {
      await this.startCreate(input.date);
      await this.page.getByLabel("Title").fill(input.title);
      if (input.notes) await this.page.getByLabel("Notes").fill(input.notes);
      if (input.allDay) await this.page.getByLabel("All day").check();
      else await this.page.getByLabel("Time", { exact: true }).fill("09:00");
      if (input.repeat) await this.page.getByLabel("Repeat weekly").selectOption("4");
      await this.page.getByRole("button", { name: /^create$/i }).press("Enter");
      await expect(this.page.getByRole("heading", { name: input.title })).toBeVisible();
      return this.eventId();
    });
  }

  async startCreate(date: string) {
    await this.page.goto(`/calendar?month=${date.slice(0, 7)}&date=${date}&view=month`);
    await expect(this.page.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();
    await this.page.getByRole("link", { name: "Create", exact: true }).click();
    await expect(this.page.locator("#agenda-date-field")).toHaveValue(date);
    const timezone = this.page.getByRole("button", { name: "Event time zone", exact: true });
    if ((await timezone.textContent())?.includes("Select a timezone")) {
      await timezone.click();
      await this.page.getByRole("option", { name: "UTC", exact: true }).click();
    }
  }

  async eventId() {
    const label = this.page.getByText("Event id", { exact: true });
    const value = await label.locator("..").getByText(eventIdPattern).textContent();
    if (!value || !eventIdPattern.test(value))
      throw new Error("Event detail did not expose its ID.");
    return value;
  }

  async saveEdit(input: {
    scope?: "future" | "series" | "single";
    title?: string;
    notes?: string;
  }) {
    if (input.scope && input.scope !== "single")
      await this.page.getByLabel("Apply changes to").selectOption(input.scope);
    if (input.title) await this.page.getByLabel("Title", { exact: true }).fill(input.title);
    if (input.notes) await this.page.getByLabel("Notes", { exact: true }).fill(input.notes);
    await this.page.getByRole("button", { name: /save changes/i }).click();
  }

  async openDelete() {
    await this.page.getByRole("button", { name: /^delete$/i }).click();
  }

  async confirmDelete(scope: "future" | "series" | "single" = "single") {
    if (scope !== "single")
      await this.page.getByLabel("Delete recurrence scope").selectOption(scope);
    await this.page.getByRole("button", { name: /^delete event$/i }).press("Enter");
  }

  async deleteEvent(eventId: string, scope: "future" | "series" | "single" = "single") {
    await test.step(`Delete ${scope} calendar event scope`, async () => {
      await this.openDetail(eventId);
      await this.openDelete();
      await this.confirmDelete(scope);
    });
  }
}
