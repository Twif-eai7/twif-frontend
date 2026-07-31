import { useState, useEffect } from "react";

const PREFIX = "twif_pl_data_filters_v1";

function read(screen, key, fallback) {
  try {
    const raw = localStorage.getItem(`${PREFIX}:${screen}:${key}`);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(screen, key, value) {
  try {
    localStorage.setItem(`${PREFIX}:${screen}:${key}`, JSON.stringify(value));
  } catch {
    // ignore quota / private browsing
  }
}

/** Persist P&L Data tab filters across navigation and page refresh. */
export function usePersistedPlFilter(screen, key, defaultValue) {
  const [value, setValue] = useState(() => read(screen, key, defaultValue));

  useEffect(() => {
    write(screen, key, value);
  }, [screen, key, value]);

  return [value, setValue];
}
