export function buildDeploymentCsp(config: Record<string, unknown>): string;
export function projectDeploymentProfile(html: string, config: Record<string, unknown>): string;
export function applyDeploymentProfile(
  distDir?: string,
  options?: { dryRun?: boolean },
): boolean;
