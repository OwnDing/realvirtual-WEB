export function validateBrandAssets(root: string, config: Record<string, unknown>): Promise<Array<{ key: string; bytes: Uint8Array; path: string; target: string }>>;
export function prepareBrandAssets(root: string, config: Record<string, unknown>): Promise<Record<string, unknown>>;
export function projectStandaloneBrand(directory: string, assetRoot: string, config: Record<string, unknown>, base: string): boolean;
export function prepareBrandDelivery(options: { input: string; output: string; settings?: string; assets?: string; base?: string; pageUrl?: string }): Promise<string>;
