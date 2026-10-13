export type BrandLocalizedText = string | Partial<Record<'zh-CN' | 'en-US', string>>;
export interface BrandTheme { surfaceColor?: string; textColor?: string; mutedTextColor?: string; borderColor?: string }
export interface BrandIdentity { productName?: string; shortName?: string; companyName?: string; description?: string; logoUrl?: string; faviconUrl?: string; primaryColor?: string; secondaryColor?: string }
export interface DeploymentBranding {
  schemaVersion: 1;
  browserTitle?: string;
  theme?: BrandTheme;
  splash?: { logoUrl?: string; backgroundColor?: string; textColor?: string; tagline?: BrandLocalizedText; animation?: 'none' | 'orbit' };
  attribution?: { visible?: boolean; text?: BrandLocalizedText; url?: string };
  icons?: { appleTouchUrl?: string; pwa192Url?: string; pwa512Url?: string; maskable512Url?: string };
  social?: { imageUrl?: string; title?: string; description?: string };
}
export interface ResolvedBrand {
  configured: boolean; productName: string; shortName: string; companyName?: string; description: string; browserTitle: string;
  logoUrl: string; faviconUrl: string; primaryColor: string; secondaryColor: string; theme: BrandTheme;
  splash: { logoUrl: string; backgroundColor: string; textColor: string; tagline: BrandLocalizedText; animation: 'none' | 'orbit' };
  attribution: { visible: boolean; text: BrandLocalizedText; url?: string };
  icons: Required<NonNullable<DeploymentBranding['icons']>>;
  social: { title: string; description: string; imageUrl?: string };
  publicConfig: { schemaVersion: 2; identity: BrandIdentity; branding?: DeploymentBranding };
}
export function brandAssetPath(value: unknown): string | undefined;
export function parseBrandIdentity(value: unknown, issues?: string[]): BrandIdentity | undefined;
export function parseBranding(value: unknown, issues?: string[]): DeploymentBranding | undefined;
export function resolveDeploymentBrand(raw?: { schemaVersion?: unknown; identity?: unknown; branding?: unknown }, issues?: string[]): ResolvedBrand;
export function localizeBrandText(value: BrandLocalizedText | undefined, locale: string, fallback?: string): string;
export function brandAssetHref(path: string, base?: string): string;
export function brandCssVariables(brand: ResolvedBrand): Record<string, string>;
export function escapeBrandHtml(value: unknown): string;
export function safeBrandJson(value: unknown): string;
export const DEFAULT_BRAND_TEXT: { tagline: BrandLocalizedText; attribution: BrandLocalizedText };
