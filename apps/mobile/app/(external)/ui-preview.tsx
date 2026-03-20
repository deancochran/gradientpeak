import { buttonFixtures } from "@repo/ui/components/button/fixtures";
import { Button } from "@repo/ui/components/button";
import { cardFixtures } from "@repo/ui/components/card/fixtures";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { inputFixtures } from "@repo/ui/components/input/fixtures";
import { Input } from "@repo/ui/components/input";
import { tabsFixtures } from "@repo/ui/components/tabs/fixtures";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";
import { Text } from "@repo/ui/components/text";
import { ScrollView, View } from "react-native";

export default function UiPreviewScreen() {
  const tabsFixture = tabsFixtures.settings;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 p-6"
    >
      <View className="gap-2">
        <Text className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
          Shared UI Preview
        </Text>
        <Text className="text-3xl font-semibold">
          Fixture-driven mobile preview
        </Text>
        <Text className="text-sm text-muted-foreground">
          This screen renders shared UI components from @repo/ui using the same
          fixtures that drive package tests and web preview coverage.
        </Text>
      </View>

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
        <CardContent className="gap-3">
          <Input {...inputFixtures.email} />
          <Button {...buttonFixtures.save}>
            <Text>{buttonFixtures.save.children}</Text>
          </Button>
        </CardContent>
      </Card>

      <Tabs
        testId={tabsFixture.rootTestId}
        value={tabsFixture.values.overview}
        onValueChange={() => {}}
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
            <CardContent>
              <Text>{tabsFixture.content.overview}</Text>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </ScrollView>
  );
}
