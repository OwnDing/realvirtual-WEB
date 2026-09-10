// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 realvirtual GmbH <https://realvirtual.io>

// Shared by deployment tooling and the browser. This is maintained source.
export const EGRESS_PURPOSES = [
    'analytics',
    'news',
    'documentation',
    'legal-link',
    'connect-updates',
    'firebase-demo',
    'github-library',
    'cad-link',
    'remote-model',
    'industrial-interface',
    'multiuser',
    'share',
    'debug-tool',
];
const PURPOSE_SET = new Set(EGRESS_PURPOSES);
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value, max) {
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    return trimmed && trimmed.length <= max ? trimmed : undefined;
}
export function canonicalEgressOrigin(value) {
    const candidate = text(value, 300);
    if (!candidate)
        return null;
    try {
        const parsed = new URL(candidate);
        if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol))
            return null;
        if (parsed.username || parsed.password || parsed.search || parsed.hash)
            return null;
        if (parsed.pathname !== '/' && parsed.pathname !== '')
            return null;
        return parsed.origin;
    }
    catch {
        return null;
    }
}
export function parseEgress(value, issues) {
    if (value === undefined)
        return { mode: 'deny-external', allow: [] };
    if (!isRecord(value)) {
        issues.push('egress must be an object; external access remains denied');
        return { mode: 'deny-external', allow: [] };
    }
    const mode = value.mode === 'allow-listed' ? 'allow-listed' : 'deny-external';
    if (value.mode !== undefined && value.mode !== 'allow-listed' && value.mode !== 'deny-external') {
        issues.push('egress.mode is invalid; external access remains denied');
    }
    const allow = [];
    if (value.allow !== undefined && !Array.isArray(value.allow)) {
        issues.push('egress.allow must be an array');
    }
    else if (Array.isArray(value.allow)) {
        for (const [index, rawRule] of value.allow.slice(0, 100).entries()) {
            if (!isRecord(rawRule)) {
                issues.push(`egress.allow[${index}] must be an object`);
                continue;
            }
            const origin = canonicalEgressOrigin(rawRule.origin);
            const purposes = Array.isArray(rawRule.purposes)
                ? [...new Set(rawRule.purposes.filter((purpose) => (typeof purpose === 'string' && PURPOSE_SET.has(purpose))))]
                : [];
            if (!origin || purposes.length === 0) {
                issues.push(`egress.allow[${index}] has no valid origin/purpose and was ignored`);
                continue;
            }
            allow.push({ origin, purposes });
        }
    }
    return { mode, allow };
}
