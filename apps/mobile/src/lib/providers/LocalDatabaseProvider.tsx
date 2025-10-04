// apps/native/app/providers/LocalDatabaseProvider.tsx
import migrations from "@/lib/db/migrations/migrations";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import * as React from "react";
import { ActivityIndicator, View } from "react-native";

import { SQLiteProvider } from "expo-sqlite";
import { localdb } from "../db";

export function LocalDatabaseProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { success, error } = useMigrations(localdb, migrations);

  if (error) {
    throw new Error(`Database migration failed: ${error.message}`);
  }

  if (!success) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <SQLiteProvider databaseName="db.db">{children}</SQLiteProvider>;
}
