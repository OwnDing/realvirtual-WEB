export function buildDeploymentCsp(config: Record<string, unknown>): string;
export function projectDeploymentProfile(html: string, config: Record<string, unknown>, options?: { base?: string; pageUrl?: string; styleHref?: string }): string;
export function applyDeploymentProfile(
  distDir?: string,
  options?: { dryRun?: boolean; profile?: string; base?: string; pageUrl?: string },
): boolean;
