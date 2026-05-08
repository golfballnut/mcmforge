import type { CustomFieldSchema } from './index';

export const customFields: CustomFieldSchema[] = [
  {
    entity: 'contact',
    key: 'preferred_contact_method',
    label: 'Preferred contact method',
    type: 'select',
    options: ['email', 'phone', 'text'],
    required: false,
  },
];
