#!/usr/bin/env node
// Thin alias: `codestory` is `@particular-labs/codestory`. The scoped
// package remains the single source of truth — this just re-execs its
// CLI in-process (dist/cli.js calls runMain() at the top level, so
// importing it is equivalent to running it directly).
import "@particular-labs/codestory/dist/cli.js";
