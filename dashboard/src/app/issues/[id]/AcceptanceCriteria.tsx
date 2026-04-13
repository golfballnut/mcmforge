"use client";
import { useTransition } from "react";
import { toggleCriterion } from "./actions";

interface CriterionItem {
  criterion: string;
  verified: boolean;
}

export function AcceptanceCriteria({
  issueId,
  criteria,
}: {
  issueId: string;
  criteria: CriterionItem[];
}) {
  const [isPending, startTransition] = useTransition();

  function handleToggle(index: number) {
    startTransition(async () => {
      await toggleCriterion(issueId, index, !criteria[index].verified);
    });
  }

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5 mb-6">
      <h3 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-3">
        Acceptance Criteria
      </h3>
      <ul className="space-y-2">
        {criteria.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-[#e6edf3]">
            <input
              type="checkbox"
              checked={item.verified}
              onChange={() => handleToggle(i)}
              disabled={isPending}
              className="mt-1 w-3.5 h-3.5 accent-[#3fb950] shrink-0 cursor-pointer"
            />
            <span className={`leading-relaxed break-words ${item.verified ? "line-through text-[#8b949e]" : ""}`}>
              {item.criterion}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
