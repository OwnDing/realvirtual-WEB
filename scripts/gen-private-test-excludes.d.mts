// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * TypeScript reads THIS file for `gen-private-test-excludes.mjs`, never the
 * implementation beside it — `allowJs` is off. A function added to the `.mjs`
 * and not declared here compiles to "has no exported member"; a function
 * declared here and deleted there type-checks everywhere and throws at runtime.
 * `tests/private-test-excludes.node.test.ts` asserts the two stay in step.
 */

/** Import specifiers that need a private sibling repo to resolve. */
export function isPrivateSpecifier(spec: string): boolean;

/** Sorted repo-relative list of test files that import private-only modules. */
export function computePrivateDependentTests(root?: string): string[];

/** Sorted list of e2e spec filenames that cannot run without the private sibling. */
export function computePrivateDependentSpecs(root?: string): string[];
