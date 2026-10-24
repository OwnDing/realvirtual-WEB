// SPDX-License-Identifier: AGPL-3.0-only
import { Button } from '@mui/material';
import { getLocale, useRvTranslation } from '../i18n';
import { userHelpMessages } from '../i18n/catalogs/user-help';
import { helpDestination } from './help-destination';
import { useUIVisible } from './ui-context-store';
export function UserHelpLink({ topic }: { topic: string }) {
  useRvTranslation('shell');
  const visible = useUIVisible('help', { hiddenIn: ['kiosk'] });
  const href = helpDestination({ slug: topic }), m = userHelpMessages(getLocale());
  return visible && href ? <Button size="small" component="a" href={href} target="_blank" rel="noopener noreferrer" aria-label={m.open}>{m.help}</Button> : null;
}
