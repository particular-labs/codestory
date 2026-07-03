import { watch, type FSWatcher } from 'node:fs';

// Live-reload plumbing: watch the flat `.codestory/` directory and fan a single,
// debounced "something changed" signal out to every subscribed SSE client.
// `.codestory/` is flat (no nested dirs), so a non-recursive fs.watch is reliable
// on macOS and Linux without pulling in a watcher dependency. Never throws — if
// the platform can't watch, live reload is simply disabled and present keeps serving.

export interface DirWatcher {
  subscribe(fn: () => void): () => void;
  close(): void;
}

export function watchDir(dir: string, debounceMs = 150): DirWatcher {
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let watcher: FSWatcher | null = null;

  const fire = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      for (const fn of [...listeners]) fn();
    }, debounceMs);
  };

  try {
    watcher = watch(dir, fire);
    watcher.on('error', (e) => console.error(`⚠ watch error on ${dir}: ${e} — live reload disabled`));
  } catch (e) {
    console.error(`⚠ could not watch ${dir}: ${(e as Error).message} — live reload disabled`);
  }

  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    close() {
      if (timer) clearTimeout(timer);
      watcher?.close();
      listeners.clear();
    },
  };
}
