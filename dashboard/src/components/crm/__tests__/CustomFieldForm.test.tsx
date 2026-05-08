import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CustomFieldForm } from '../CustomFieldForm';
import type { CustomFieldSchema } from '@/lib/crm/custom-fields';

const fields: CustomFieldSchema[] = [
  { entity: 'contact', key: 'lead_source', label: 'Lead source', type: 'text' },
  { entity: 'contact', key: 'preferred_contact_method', label: 'Preferred', type: 'select', options: ['email', 'phone'] },
];

describe('CustomFieldForm', () => {
  it('renders one input per field', () => {
    render(<CustomFieldForm fields={fields} values={{ lead_source: 'web' }} />);
    expect(screen.getByLabelText('Lead source')).toHaveValue('web');
  });

  it('renders select with options', () => {
    render(<CustomFieldForm fields={fields} values={{}} />);
    const sel = screen.getByLabelText('Preferred');
    expect(sel.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'email' })).toBeInTheDocument();
  });

  it('renders nothing when fields is empty', () => {
    const { container } = render(<CustomFieldForm fields={[]} values={{}} />);
    expect(container.querySelector('input,select')).toBeNull();
  });
});
