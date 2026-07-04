// Pure export metadata — no DOM/browser deps, so it's unit-testable from the repo's
// bun test suite. The DOM assembly (composeExportPng) lives in ./export.
export interface ExportOpts {
  title: boolean;
  description: boolean;
  background: boolean;
  legend: boolean;
  ghosts: boolean;
}
export const DEFAULT_EXPORT_OPTS: ExportOpts = { title: true, description: true, background: true, legend: true, ghosts: true };

export const EXPORT_TOGGLES: Array<{ key: keyof ExportOpts; label: string }> = [
  { key: 'title', label: 'Journey title' },
  { key: 'description', label: 'Description / ports' },
  { key: 'background', label: 'Background grid' },
  { key: 'legend', label: 'Step legend' },
  { key: 'ghosts', label: 'Ghost variants' },
];

export interface ExportMeta {
  title: string;
  subtitle: string;
  legend: string;
}

/** Node counts → the legend line shown under an export. */
export function summarize(nodes: Array<{ type: string; status?: string; journey?: string }>): string {
  const total = nodes.length;
  const built = nodes.filter((n) => n.status === 'built').length;
  const exits = nodes.filter((n) => n.type === 'exit').length;
  const subs = nodes.filter((n) => n.journey).length;
  const parts = [`${total} step${total === 1 ? '' : 's'}`, `${built} built`, `${exits} exit${exits === 1 ? '' : 's'}`];
  if (subs) parts.push(`${subs} sub-flow${subs === 1 ? '' : 's'}`);
  return parts.join(' · ');
}
