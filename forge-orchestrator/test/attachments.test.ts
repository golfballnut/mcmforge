import { describe, it, expect } from 'vitest';
import { buildAttachmentContext } from '../src/services/issueAttachments.js';

describe('buildAttachmentContext', () => {
  it('returns empty string for no attachments', () => {
    expect(buildAttachmentContext([])).toBe('');
  });

  it('includes [ATTACHMENTS] block header', () => {
    const attachments = [
      { id: 'a1', filename: 'screenshot.png', mime_type: 'image/png', storage_path: 'issues/123/screenshot.png', size_bytes: 2048 },
    ];
    const result = buildAttachmentContext(attachments);
    expect(result).toContain('[ATTACHMENTS]');
    expect(result).toContain('[/ATTACHMENTS]');
  });

  it('includes filename in output', () => {
    const attachments = [
      { id: 'a1', filename: 'mockup.png', mime_type: 'image/png', storage_path: 'issues/123/mockup.png', size_bytes: 5120 },
    ];
    expect(buildAttachmentContext(attachments)).toContain('mockup.png');
  });

  it('includes mime type in output', () => {
    const attachments = [
      { id: 'a1', filename: 'spec.pdf', mime_type: 'application/pdf', storage_path: 'issues/123/spec.pdf', size_bytes: 102400 },
    ];
    expect(buildAttachmentContext(attachments)).toContain('application/pdf');
  });

  it('formats file sizes correctly', () => {
    const kb = [{ id: 'a1', filename: 'a.png', mime_type: 'image/png', storage_path: 'x', size_bytes: 2048 }];
    expect(buildAttachmentContext(kb)).toContain('2KB');

    const mb = [{ id: 'a2', filename: 'b.png', mime_type: 'image/png', storage_path: 'x', size_bytes: 2 * 1024 * 1024 }];
    expect(buildAttachmentContext(mb)).toContain('2MB');

    const bytes = [{ id: 'a3', filename: 'c.png', mime_type: 'image/png', storage_path: 'x', size_bytes: 500 }];
    expect(buildAttachmentContext(bytes)).toContain('500B');
  });

  it('lists count of attachments', () => {
    const attachments = [
      { id: 'a1', filename: 'a.png', mime_type: 'image/png', storage_path: 'x', size_bytes: 1024 },
      { id: 'a2', filename: 'b.png', mime_type: 'image/png', storage_path: 'y', size_bytes: 1024 },
    ];
    expect(buildAttachmentContext(attachments)).toContain('2 file(s)');
  });
});
