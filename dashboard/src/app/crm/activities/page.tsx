import { createForgeClient } from '@/lib/supabase/forge-server';
import { getActiveCompany } from '@/lib/get-active-company';
import { ActivityTimeline } from '@/components/crm/ActivityTimeline';
import type { TimelineEntry } from '@/lib/crm/types';

export const revalidate = 0;

async function getRecent(companyId: string): Promise<TimelineEntry[]> {
  const supabase = await createForgeClient();
  const { data } = await supabase
    .from('crm_activity_timeline')
    .select('*')
    .eq('company_id', companyId)
    .order('occurred_at', { ascending: false })
    .limit(200);
  return (data ?? []) as TimelineEntry[];
}

export default async function ActivitiesPage() {
  const company = await getActiveCompany();
  const items = company ? await getRecent(company.id) : [];
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">Activities</h1>
      <p className="text-sm text-[#8b949e] mb-4">Most-recent {items.length} entries.</p>
      <ActivityTimeline entries={items} />
    </div>
  );
}
