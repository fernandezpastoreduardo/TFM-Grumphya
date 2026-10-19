import { useEffect, useState } from "react";

export function useDelayedVisibility(delayMs = 200): boolean {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setIsVisible(true), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs]);

  return isVisible;
}
