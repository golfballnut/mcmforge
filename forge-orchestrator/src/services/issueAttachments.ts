import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';

export interface IssueAttachment {
  id: string;
  filename: string;
  mime_type: string;
  storage_path: string;
  size_bytes: number;
}

export async function getIssueAttachments(
  supabase: SupabaseClient,
  issueId: string,
): Promise<IssueAttachment[]> {
  const { data, error } = await supabase
    .from('issue_attachments')
    .select('id, filename, mime_type, storage_path, size_bytes')
    .eq('issue_id', issueId)
    .order('created_at', { ascending: true });

  if (error) {
    logger.warn({ err: error, issueId }, 'Failed to fetch issue attachments');
    return [];
  }
  return (data as IssueAttachment[]) ?? [];
}

export function buildAttachmentContext(attachments: IssueAttachment[]): string {
  if (attachments.length === 0) return '';

  const lines = [
    '[ATTACHMENTS]',
    `${attachments.length} file(s) attached to this issue:`,
    '',
    ...attachments.map((a, i) =>
      `${i + 1}. ${a.filename} (${a.mime_type}, ${formatSize(a.size_bytes)})`
    ),
    '',
    'These files are available in Supabase Storage. If you need to view images or read documents, ask a human to share them or access them via the dashboard.',
    '[/ATTACHMENTS]',
  ];
  return lines.join('\n');
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}
