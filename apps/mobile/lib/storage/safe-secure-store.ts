import * as SecureStore from "expo-secure-store";

function warnSecureStoreFailure(operation: string, key: string, error: unknown): void {
  console.warn(`[SecureStore] ${operation} failed for ${key}`, error);
}

export const safeSecureStore = {
  getItem(key: string): string | null {
    try {
      return SecureStore.getItem(key);
    } catch (error) {
      warnSecureStoreFailure("getItem", key, error);
      return null;
    }
  },

  setItem(key: string, value: string): void {
    try {
      SecureStore.setItem(key, value);
    } catch (error) {
      warnSecureStoreFailure("setItem", key, error);
    }
  },

  async getItemAsync(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      warnSecureStoreFailure("getItemAsync", key, error);
      return null;
    }
  },

  async setItemAsync(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      warnSecureStoreFailure("setItemAsync", key, error);
    }
  },

  async deleteItemAsync(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      warnSecureStoreFailure("deleteItemAsync", key, error);
    }
  },
};
