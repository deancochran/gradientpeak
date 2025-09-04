import { Database } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";

import Activity from "./models/Activity";
import LocationPoint from "./models/LocationPoint";
import { mySchema } from "./schema";

// First, create the adapter to the underlying database:
const adapter = new SQLiteAdapter({
  schema: mySchema,
  // (You might want to comment out migrations for development purposes -- see WatermelonDB docs)
  // migrations,
  // dbName: 'myapp', // optional database name or file system path
  // It's recommended to increase this number during development.
  // See https://nozbe.github.io/WatermelonDB/Advanced/Performance.html#tips
  jsi: true /* Platform.OS === 'ios' */,
  onSetUpError: (error) => {
    // Database failed to load -- offer the user to reload the app or log out
    console.error("Failed to setup WatermelonDB", error);
  },
});

// Then, make a Watermelon database from it!
export const database = new Database({
  adapter,
  modelClasses: [Activity, LocationPoint],
});
