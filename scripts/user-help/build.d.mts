export function escapeHtml(value: unknown): string;
export function sha(value: string | Uint8Array): string;
export function stripMetadata(text: string): string;
export function headingId(text: string): string;
export function safeUrl(value: string): string;
export function renderMarkdown(source: string, resolveLink?: (value: string, image: boolean) => string): { html: string; anchors: string[]; links: string[] };
export function generateFiles(options?: { mediaRequired?: boolean }): Map<string, string | Uint8Array>;
export function buildHelp(options?: { check?: boolean; output?: string; mediaRequired?: boolean }): number;
