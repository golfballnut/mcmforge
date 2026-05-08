import type { CustomFieldSchema } from './index';

export const customFields: CustomFieldSchema[] = [
  { entity: 'account', key: 'reseller_status', label: 'Reseller status', type: 'text', required: false },
];
