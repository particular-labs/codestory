import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { defineCommand } from 'citty';
import { resolve } from 'node:path';
import { z } from 'zod';
import { version } from '../package.json';
import {
  appendNoteHandler,
  getJourneyContextHandler,
  getJourneyHandler,
  listJourneysHandler,
  setNoteStatusHandler,
  validateHandler,
} from './mcp-tools';

// Thin stdio glue: each tool below is a one-line adapter from an MCP call onto
// a handler in mcp-tools.ts. No business logic lives here — add/rename a tool
// by touching mcp-tools.ts first, then wiring it in here.

function textResult(value: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

function errorResult(message: string): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  return { ...textResult({ error: message }), isError: true };
}

/** Build the MCP server for one `.codestory/` directory (fixed at construction — one server per root). */
export function buildMcpServer(rootDir: string): McpServer {
  const server = new McpServer({ name: 'codestory', version });

  server.registerTool(
    'list_journeys',
    {
      description: 'List every journey in the .codestory/ directory (id, title, status, entries, exits).',
      inputSchema: {},
    },
    async () => textResult(await listJourneysHandler(rootDir)),
  );

  server.registerTool(
    'get_journey',
    {
      description: 'Get the full definition of one journey by id.',
      inputSchema: { id: z.string().min(1).describe('Journey id') },
    },
    async ({ id }) => {
      const journey = await getJourneyHandler(rootDir, { id });
      return journey ? textResult(journey) : errorResult(`unknown journey '${id}'`);
    },
  );

  server.registerTool(
    'validate',
    {
      description: 'Run schema + referential validation over the .codestory/ directory.',
      inputSchema: {},
    },
    async () => textResult(await validateHandler(rootDir)),
  );

  server.registerTool(
    'append_note',
    {
      description: 'Append a review note against a journey, optionally scoped to one of its steps.',
      inputSchema: {
        journey: z.string().min(1).describe('Journey id the note is about'),
        step: z.string().min(1).optional().describe('Step id within the journey (optional)'),
        text: z.string().min(1).describe('Note text'),
      },
    },
    async (args) => {
      const r = await appendNoteHandler(rootDir, args);
      return r.ok ? textResult(r.note) : errorResult(r.error);
    },
  );

  server.registerTool(
    'set_note_status',
    {
      description: "Flip an existing note's status between open and applied.",
      inputSchema: {
        id: z.string().min(1).describe('Note id'),
        status: z.enum(['open', 'applied']).describe('New status'),
      },
    },
    async (args) => {
      const r = await setNoteStatusHandler(rootDir, args);
      return r.ok ? textResult(r.note) : errorResult(r.error);
    },
  );

  server.registerTool(
    'get_journey_context',
    {
      description:
        'Render one journey, plus its linked/sub-journeys one level deep, as compact markdown sized for an agent context window.',
      inputSchema: { id: z.string().min(1).describe('Journey id') },
    },
    async ({ id }) => {
      const r = await getJourneyContextHandler(rootDir, { id });
      return r.ok ? textResult(r.markdown) : errorResult(r.error);
    },
  );

  return server;
}

export const mcpCommand = defineCommand({
  meta: { name: 'mcp', description: 'Start an MCP stdio server exposing journeys as tools' },
  args: {
    dir: { type: 'string', description: 'Path to the .codestory directory', default: '.codestory' },
  },
  async run({ args }) {
    const dir = resolve(args.dir);
    const server = buildMcpServer(dir);
    await server.connect(new StdioServerTransport());
  },
});
