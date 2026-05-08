import { customFields as linksChoice } from './links-choice';
import { customFields as gbn } from './gbn';
import { customFields as hgb } from './hgb';
import { customFields as mcmForge } from './mcm-forge';
import { customFields as dirtsync } from './dirtsync';

export type CustomFieldType = 'text' | 'number' | 'select' | 'date' | 'boolean';

export interface CustomFieldSchema {
  entity: 'contact' | 'account';
  key: string;
  label: string;
  type: CustomFieldType;
  options?: string[];
  required?: boolean;
}

const REGISTRY: Record<string, CustomFieldSchema[]> = {
  'links-choice': linksChoice,
  'gbn':          gbn,
  'hgb':          hgb,
  'mcm-forge':    mcmForge,
  'dirtsync':     dirtsync,
};

export function getCustomFieldsFor(
  portfolioSlug: string,
  entity: 'contact' | 'account',
): CustomFieldSchema[] {
  const all = REGISTRY[portfolioSlug] ?? [];
  return all.filter(f => f.entity === entity);
}

export function listAllCustomFields(portfolioSlug: string): CustomFieldSchema[] {
  return REGISTRY[portfolioSlug] ?? [];
}
