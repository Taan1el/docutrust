import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadFile, REVOKE_DELAY_MS } from '../local/files.js';

describe('download helper', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('keeps the object URL alive long enough for the download to start', () => {
    expect(REVOKE_DELAY_MS).toBeGreaterThanOrEqual(1000);
    downloadFile('a.json', '{}', 'application/json');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(0);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REVOKE_DELAY_MS - 1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('removes its link from the page after clicking it', () => {
    downloadFile('a.json', '{}', 'application/json');
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
