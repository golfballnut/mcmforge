import type { CustomFieldSchema } from './index';

export const customFields: CustomFieldSchema[] = [
  { entity: 'contact', key: 'rider_type', label: 'Rider type', type: 'text', required: false },
];
