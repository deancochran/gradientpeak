// apps/native/app/providers/DatabaseProvider.tsx
import { db } from "@/lib/db";
import migrations from "@/lib/db/migrations/migrations";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { SQLiteProvider } from "expo-sqlite";
import * as React from "react";
import { ActivityIndicator, View } from "react-native";

export function LocalDatabaseProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { success, error } = useMigrations(db, migrations);

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
