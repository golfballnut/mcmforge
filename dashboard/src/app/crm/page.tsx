import { getActiveCompany } from '@/lib/get-active-company';
import { CrmLandingClient } from './CrmLandingClient';

export const revalidate = 0;

export default async function CrmLandingPage() {
  const company = await getActiveCompany();
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">CRM</h1>
      <p className="text-sm text-[#8b949e] mb-6">
        Contacts, accounts, and activity for <span className="text-white">{company?.name ?? 'this company'}</span>.
      </p>
      <CrmLandingClient />
    </div>
  );
}
