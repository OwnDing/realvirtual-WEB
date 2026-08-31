export interface DiagnosticCheck {
  id: string;
  label: string;
  level: 'required' | 'feature' | 'authoring' | 'advisory';
  status: 'pass' | 'warn' | 'fail' | 'unsupported';
  code: string;
  detail: string;
  data?: unknown;
}

export interface DiagnosticReport {
  schemaVersion: 1;
  generatedAt: string;
  origin: string;
  userAgent: string;
  checks: DiagnosticCheck[];
  summary: { pass: number; warn: number; fail: number };
}

export function runDiagnostics(options?: { supportMatrix?: Record<string, unknown>; WebSocketImpl?: typeof WebSocket }): Promise<DiagnosticReport>;
