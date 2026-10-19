// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { prepareBrandAssets, projectStandaloneBrand } from './prepare-brand-delivery.mjs';
import { applyDeploymentProfile } from './apply-deployment-profile.mjs';
const root = resolve('dist');
const config = await prepareBrandAssets(root, JSON.parse(readFileSync(join(root, 'settings.json'), 'utf8')));
writeFileSync(join(root, 'settings.json'), JSON.stringify(config, null, 2) + '\n');
applyDeploymentProfile(root);
const effective = JSON.parse(readFileSync(join(root, 'settings.json'), 'utf8'));
projectStandaloneBrand(join(root, 'present'), root, effective, process.env.VITE_BASE && process.env.VITE_BASE !== './' ? `${process.env.VITE_BASE}present/` : './');
projectStandaloneBrand(join(root, 'compatibility'), root, effective, './');
