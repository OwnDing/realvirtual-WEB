export interface ApplianceConfig {
  schemaVersion: 1;
  hostname: string;
  influxHostname: string;
  httpsPort: number;
  httpPort: number;
  controlPort: number;
  connectPort: number;
  forgejoPort: number;
  influxPort: number;
  tls: { mode: 'internal-ca' | 'customer'; certificate: string | null; privateKey: string | null; trustBundle: string | null };
  authentication: { operatorUser: string };
  license: { file: string | null };
  browserSupport: Record<string, unknown>;
}

export function validateApplianceConfig(raw: unknown, options?: { baseDir?: string }): ApplianceConfig;
export function validateCustomerCertificate(config: ApplianceConfig, now?: Date): Promise<Record<string, unknown>>;
export function renderTemplate(source: string, variables: Record<string, unknown>): string;
export function httpsPortSuffix(portValue: number): string;
