'use client';

import type { CustomFieldSchema } from '@/lib/crm/custom-fields';

interface Props {
  fields: CustomFieldSchema[];
  values: Record<string, unknown>;
  onChange?: (key: string, value: string) => void;
  namePrefix?: string;
}

export function CustomFieldForm({ fields, values, onChange, namePrefix = 'custom_fields' }: Props) {
  if (fields.length === 0) return null;
  return (
    <div className="space-y-3">
      {fields.map((f) => {
        const inputId = `cf-${f.key}`;
        const value = (values[f.key] ?? '') as string;
        const inputName = `${namePrefix}.${f.key}`;
        if (f.type === 'select') {
          return (
            <div key={f.key}>
              <label htmlFor={inputId} className="block text-sm text-[#8b949e] mb-1">{f.label}</label>
              <select
                id={inputId}
                name={inputName}
                value={value}
                onChange={(e) => onChange?.(f.key, e.target.value)}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm"
                required={f.required}
              >
                <option value="">—</option>
                {(f.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          );
        }
        return (
          <div key={f.key}>
            <label htmlFor={inputId} className="block text-sm text-[#8b949e] mb-1">{f.label}</label>
            <input
              id={inputId}
              name={inputName}
              type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
              value={value}
              onChange={(e) => onChange?.(f.key, e.target.value)}
              className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm"
              required={f.required}
            />
          </div>
        );
      })}
    </div>
  );
}
