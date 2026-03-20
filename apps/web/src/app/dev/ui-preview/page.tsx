"use client";

import { Button } from "@repo/ui/components/button";
import { buttonFixtures } from "@repo/ui/components/button/fixtures";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { cardFixtures } from "@repo/ui/components/card/fixtures";
import { Input } from "@repo/ui/components/input";
import { inputFixtures } from "@repo/ui/components/input/fixtures";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";
import { tabsFixtures } from "@repo/ui/components/tabs/fixtures";

export default function UiPreviewPage() {
  const tabsFixture = tabsFixtures.settings;

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-8 p-8">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Shared UI Preview
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Fixture-driven runtime preview
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          This page renders shared UI components from <code>@repo/ui</code>{" "}
          using fixture data that can also be reused by package tests and
          Playwright.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        <Card
          accessibilityLabel={cardFixtures.profile.accessibilityLabel}
          role={cardFixtures.profile.role}
          testId={cardFixtures.profile.testId}
        >
          <CardHeader>
            <CardTitle>{cardFixtures.recoveryCheck.title}</CardTitle>
            <CardDescription>
              {cardFixtures.recoveryCheck.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Input {...inputFixtures.email} />
              <Button {...buttonFixtures.save}>
                {buttonFixtures.save.children}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Tabs
          defaultValue={tabsFixture.values.overview}
          testId={tabsFixture.rootTestId}
        >
          <TabsList testId={tabsFixture.listTestId}>
            <TabsTrigger
              testId={tabsFixture.triggers.overview.testId}
              value={tabsFixture.values.overview}
            >
              {tabsFixture.triggers.overview.label}
            </TabsTrigger>
            <TabsTrigger
              testId={tabsFixture.triggers.sessions.testId}
              value={tabsFixture.values.sessions}
            >
              {tabsFixture.triggers.sessions.label}
            </TabsTrigger>
            <TabsTrigger
              testId={tabsFixture.triggers.notes.testId}
              value={tabsFixture.values.notes}
            >
              {tabsFixture.triggers.notes.label}
            </TabsTrigger>
          </TabsList>
          <TabsContent
            testId={tabsFixture.contentTestIds.overview}
            value={tabsFixture.values.overview}
          >
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                {tabsFixture.content.overview}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent
            testId={tabsFixture.contentTestIds.sessions}
            value={tabsFixture.values.sessions}
          >
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                {tabsFixture.content.sessions}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent
            testId={tabsFixture.contentTestIds.notes}
            value={tabsFixture.values.notes}
          >
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                {tabsFixture.content.notes}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </section>
    </main>
  );
}
