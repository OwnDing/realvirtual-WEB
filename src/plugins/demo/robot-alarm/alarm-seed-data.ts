// SPDX-License-Identifier: AGPL-3.0-only
import { rvT } from '../../../core/i18n';
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * alarm-seed-data.ts — Static demo data for the FANUC CRX "Ask AI" alarm story.
 *
 * Defines the SYST-320 contact-force alarm scenario shown in the public web demo:
 * the curated diagnosis + recommended steps, the manual deep-link targets, the
 * three seeded operator notes, and the search terms used to locate the real
 * excerpt page inside the bundled FANUC CRX PDF at runtime.
 *
 * The AI answer is intentionally faked (no backend) — the PDF excerpt and the
 * page deep-links are real.
 */

/** A direct page deep-link into the manual. */
export interface AlarmDocRef {
  /** Human-readable label shown in the Sources block. */
  label: string;
  /**
   * Static fallback page (1-based) used when {@link searchTerms} resolves nothing
   * at runtime. Verify against the bundled PDF.
   */
  page: number;
  /** Terms used by `findFirstPageWithText` to resolve the live page. */
  searchTerms: string[];
}

/** A single operator note (seeded or user-added). */
export interface AlarmNote {
  author: string;
  dateLabel: string;
  shift: string;
  text: string;
  /** True for the curated seed notes that ship with the demo. */
  seed?: boolean;
}

/** The full description of one alarm scenario. */
export interface AlarmScenario {
  id: 'SYST-320';
  code: string;
  title: string;
  subtitle: string;
  severity: 'error';
  icon: 'warning';
  timestamp: string;
  /**
   * Hierarchy path of the robot node (so the card can highlight + frame it in 3D).
   * Matches the existing demo robot tile. NOTE: verify live against the GLB.
   */
  componentPath: string;
  /** Same-origin URL of the bundled FANUC CRX manual. */
  manualUrl: string;
  diagnosis: string;
  /** Recommended steps, ordered/weighted by what the operator notes show. */
  recommendedSteps: string[];
  /** Manual deep-link targets shown in the Sources block. */
  docRefs: AlarmDocRef[];
  /** Curated seed notes (shown first in History). */
  seedNotes: AlarmNote[];
  /** Terms used to locate the live excerpt page in the PDF. */
  excerptSearchTerms: string[];
}

/**
 * Robot node path. Matches the existing robot maintenance tile in the demo.
 * NOTE: verify live against the loaded DemoRealvirtualWeb.glb (`scene_find` / `web_*`).
 */
const ROBOT_COMPONENT_PATH = 'A4';

/** Same-origin URL of the bundled FANUC CRX educational-cell manual. */
const FANUC_MANUAL_URL = `${import.meta.env.BASE_URL}pdf/fanuc-crx-educational-cell-manual.pdf`;

/**
 * The SYST-320 scenario.
 *
 * Page numbers in `docRefs` / the default excerpt page are static fallbacks
 * verified against the bundled FANUC CRX educational-cell PDF: "payload" → p.25,
 * "contact stop" → p.11, "dual check safety" → p.14. They are also resolved live
 * at runtime via `findFirstPageWithText`. Re-verify these if the bundled PDF is
 * replaced.
 */
export const SYST_320_SCENARIO: AlarmScenario = {
  id: 'SYST-320',
  code: 'SYST-320',
  // Getters, not strings: this object is built at module load — long before a
  // language preference exists — and every field below is rendered prose. A
  // resolved string here would be frozen at whatever the first import saw.
  get title() { return rvT('demo', 'alarm.syst320Title'); },
  get subtitle() { return rvT('demo', 'alarm.syst320Sub'); },
  severity: 'error',
  icon: 'warning',
  timestamp: '08:42',
  componentPath: ROBOT_COMPONENT_PATH,
  manualUrl: FANUC_MANUAL_URL,
  get diagnosis() { return rvT('demo', 'alarm.diagnosisText'); },
  get recommendedSteps() {
    return [
      rvT('demo', 'alarm.step1'),
      rvT('demo', 'alarm.step2'),
      rvT('demo', 'alarm.step3'),
      rvT('demo', 'alarm.step4'),
      rvT('demo', 'alarm.step5'),
    ];
  },
  // Search terms hit the ENGLISH manual PDF, so they are not copy and must not
  // move — a translated term finds nothing in the document being searched.
  get docRefs() {
    return [
      { label: rvT('demo', 'spec.fanucPayloadDoc'), page: 25, searchTerms: ['payload', 'load setting'] },
      { label: rvT('demo', 'spec.fanucDcsDoc'), page: 11, searchTerms: ['contact stop', 'dual check safety', 'dcs'] },
    ];
  },
  excerptSearchTerms: ['contact stop', 'dual check safety', 'payload', 'dcs'],
  get seedNotes() {
    return [
      {
        author: 'Roberto M.',
        dateLabel: rvT('demo', 'alarm.note1Date'),
        shift: rvT('demo', 'alarm.dayShift'),
        seed: true,
        text: rvT('demo', 'alarm.note1'),
      },
      {
        author: 'Anja K.',
        dateLabel: rvT('demo', 'alarm.note2Date'),
        shift: rvT('demo', 'alarm.dayShift'),
        seed: true,
        text: rvT('demo', 'alarm.note2'),
      },
      {
        author: 'Yuki N.',
        dateLabel: rvT('demo', 'alarm.note3Date'),
        shift: rvT('demo', 'alarm.nightShift'),
        seed: true,
        text: rvT('demo', 'alarm.note3'),
      },
    ];
  },
};

/** All scenarios keyed by id (single entry today). */
export const ALARM_SCENARIOS: Record<AlarmScenario['id'], AlarmScenario> = {
  'SYST-320': SYST_320_SCENARIO,
};
