import { useEffect, useRef, useState } from "react";

/**
 * Debounces a value by delaying updates until after a specified delay.
 * Useful for search inputs, filters, and other frequently changing values.
 *
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default: 300ms)
 * @returns Debounced value that only updates after the delay
 *
 * @example
 * ```typescript
 * function SearchInput() {
 *   const [search, setSearch] = useState("");
 *   const debouncedSearch = useDebouncedValue(search, 300);
 *
 *   const { data } = trpc.activities.search.useQuery(
 *     { query: debouncedSearch },
 *     { enabled: debouncedSearch.length > 0 }
 *   );
 *
 *   return (
 *     <TextInput
 *       value={search}
 *       onChangeText={setSearch}
 *       placeholder="Search activities..."
 *     />
 *   );
 * }
 * ```
 */
export function useDebouncedValue<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set up timeout to update debounced value after delay
    const timeoutId = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Clean up timeout if value changes before delay completes
    return () => {
      clearTimeout(timeoutId);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Debounces a callback function by delaying execution until after a specified delay.
 * Unlike useDebouncedValue, this debounces the function call itself.
 *
 * @param callback - Function to debounce
 * @param delay - Delay in milliseconds (default: 300ms)
 * @returns Debounced function
 *
 * @example
 * ```typescript
 * function SearchInput() {
 *   const [results, setResults] = useState([]);
 *
 *   const debouncedSearch = useDebouncedCallback(
 *     async (query: string) => {
 *       const data = await searchAPI(query);
 *       setResults(data);
 *     },
 *     300
 *   );
 *
 *   return (
 *     <TextInput
 *       onChangeText={debouncedSearch}
 *       placeholder="Search..."
 *     />
 *   );
 * }
 * ```
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delay: number = 300,
): (...args: Args) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clean up on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (...args: Args) => {
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  };
}
