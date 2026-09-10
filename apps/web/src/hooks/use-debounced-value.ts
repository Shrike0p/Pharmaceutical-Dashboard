import { useEffect, useState } from "react";

/**
 * Trails `value` by `delayMs`, resetting the timer on every change — so a
 * search box drives one request when typing stops rather than one per
 * keystroke.
 *
 * The timeout is cleared on unmount and on every re-run, which is what stops a
 * component that unmounts mid-type from setting state afterwards.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
