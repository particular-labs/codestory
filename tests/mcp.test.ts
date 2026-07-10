import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffoldDir } from '../src/init';

// Integration smoke test: spawn the real `codestory mcp` process over stdio
// (via `bun src/cli.ts`, the same entry point the built dist/cli.js exposes)
// and do one tools/list round-trip. Unit coverage of each handler's behavior
// lives in tests/mcp-tools.test.ts; this just proves the transport wiring works.
describe('mcp stdio server (integration)', () => {
  test('tools/list exposes exactly the 6 v1 tools', async () => {
    const root = mkdtempSync(join(tmpdir(), 'codestory-mcp-smoke-'));
    const dir = join(root, '.codestory');
    scaffoldDir(dir, 'Demo');

    const cliPath = join(import.meta.dir, '..', 'src', 'cli.ts');
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [cliPath, 'mcp', '--dir', dir],
    });
    const client = new Client({ name: 'codestory-test-client', version: '0.0.0' });

    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual(['append_note', 'get_journey', 'get_journey_context', 'list_journeys', 'set_note_status', 'validate']);
    } finally {
      await client.close();
    }
  }, 15_000);
});
