import * as SecureStore from "expo-secure-store";

function warnSecureStoreFailure(operation: string, error: unknown): void {
  console.warn(`[SecureStore] ${operation} failed`, error);
}

export const safeSecureStore = {
  getItem(key: string): string | null {
    try {
      return SecureStore.getItem(key);
    } catch (error) {
      warnSecureStoreFailure("getItem", error);
      return null;
    }
  },

  setItem(key: string, value: string): void {
    try {
      SecureStore.setItem(key, value);
    } catch (error) {
      warnSecureStoreFailure("setItem", error);
    }
  },

  async getItemAsync(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      warnSecureStoreFailure("getItemAsync", error);
      return null;
    }
  },

  async setItemAsync(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      warnSecureStoreFailure("setItemAsync", error);
    }
  },

  async deleteItemAsync(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      warnSecureStoreFailure("deleteItemAsync", error);
    }
  },

  async getItemAsyncOrThrow(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      warnSecureStoreFailure("getItemAsync", error);
      throw error;
    }
  },

  async setItemAsyncOrThrow(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      warnSecureStoreFailure("setItemAsync", error);
      throw error;
    }
  },

  async deleteItemAsyncOrThrow(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      warnSecureStoreFailure("deleteItemAsync", error);
      throw error;
    }
  },
};
