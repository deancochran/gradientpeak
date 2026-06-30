import { useCallback, useMemo, useState } from "react";

export function useBuilderSheetStack<TSheet extends string>() {
  const [activeSheet, setActiveSheet] = useState<TSheet | null>(null);
  const [sheetHistory, setSheetHistory] = useState<TSheet[]>([]);

  const openSheet = useCallback((sheet: TSheet) => {
    setSheetHistory([]);
    setActiveSheet(sheet);
  }, []);

  const pushSheet = useCallback(
    (sheet: TSheet) => {
      if (activeSheet) {
        setSheetHistory((history) => [...history, activeSheet]);
      }
      setActiveSheet(sheet);
    },
    [activeSheet],
  );

  const replaceSheet = useCallback((sheet: TSheet) => {
    setActiveSheet(sheet);
  }, []);

  const closeSheet = useCallback(() => {
    setActiveSheet(null);
    setSheetHistory([]);
  }, []);

  const goBackSheet = useCallback(() => {
    setSheetHistory((history) => {
      const previous = history[history.length - 1];
      setActiveSheet(previous ?? null);
      return history.slice(0, -1);
    });
  }, []);

  return useMemo(
    () => ({
      activeSheet,
      canGoBack: sheetHistory.length > 0,
      closeSheet,
      goBackSheet,
      openSheet,
      pushSheet,
      replaceSheet,
      sheetHistory,
    }),
    [activeSheet, closeSheet, goBackSheet, openSheet, pushSheet, replaceSheet, sheetHistory],
  );
}
