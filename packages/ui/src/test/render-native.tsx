type TestingLibraryNative = typeof import("@testing-library/react-native/pure");

function getTestingLibraryNative(): TestingLibraryNative {
  const testingLibraryNative = (
    globalThis as typeof globalThis & { __uiRntl?: TestingLibraryNative }
  ).__uiRntl;

  if (!testingLibraryNative) {
    throw new Error("Native Testing Library has not been initialized");
  }

  return testingLibraryNative;
}

export function renderNative(ui: React.ReactElement) {
  return getTestingLibraryNative().render(ui);
}

export const fireEvent = Object.assign(
  (...args: Parameters<TestingLibraryNative["fireEvent"]>) =>
    getTestingLibraryNative().fireEvent(...args),
  {
    press: (...args: Parameters<TestingLibraryNative["fireEvent"]["press"]>) =>
      getTestingLibraryNative().fireEvent.press(...args),
  },
);

export const screen = new Proxy({} as TestingLibraryNative["screen"], {
  get(_target, property) {
    return getTestingLibraryNative().screen[
      property as keyof TestingLibraryNative["screen"]
    ];
  },
});
