import type { CustomFieldSchema } from './index';

export const customFields: CustomFieldSchema[] = [
  { entity: 'contact', key: 'product_interest', label: 'Product interest', type: 'text', required: false },
];
