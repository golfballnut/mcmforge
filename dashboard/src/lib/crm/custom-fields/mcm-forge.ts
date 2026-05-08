import type { CustomFieldSchema } from './index';

export const customFields: CustomFieldSchema[] = [
  { entity: 'contact', key: 'lead_source', label: 'Lead source', type: 'text', required: false },
];
