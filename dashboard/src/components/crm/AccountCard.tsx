import Link from 'next/link';
import type { Account } from '@/lib/crm/types';

const TYPE_COLORS: Record<string, string> = {
  supplier: 'bg-[#1f3358] text-[#58a6ff]',
  customer: 'bg-[#0f2d1f] text-[#3fb950]',
  partner:  'bg-[#2b1f5c] text-[#a371f7]',
  other:    'bg-[#30363d] text-[#8b949e]',
};

export function AccountCard({ account }: { account: Account }) {
  return (
    <Link
      href={`/crm/accounts/${account.id}`}
      className="block border border-[#30363d] rounded p-3 hover:border-[#58a6ff] transition-colors"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-white">{account.name}</div>
          {account.domain && <div className="text-xs text-[#8b949e]">{account.domain}</div>}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded ${TYPE_COLORS[account.account_type] ?? TYPE_COLORS.other}`}>
          {account.account_type}
        </span>
      </div>
    </Link>
  );
}
