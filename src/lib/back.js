// Android hardware back button: screens can register a handler that runs
// before the default "navigate back" (e.g. the quiz asks to save progress).
import { useEffect, useRef } from 'react';

const handlers = [];

export function runBackHandlers() {
  for (let i = handlers.length - 1; i >= 0; i -= 1) {
    if (handlers[i].current?.() === true) return true;
  }
  return false;
}

/** handler() returns true when it handled the back press. */
export function useBackHandler(handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    handlers.push(ref);
    return () => {
      const i = handlers.indexOf(ref);
      if (i >= 0) handlers.splice(i, 1);
    };
  }, []);
}
