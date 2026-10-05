import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceModeControl } from '../local/WorkspaceMode.js';
import { axe } from './axe.js';

const storage = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock('../local/workspace.js', () => ({ loadMode: storage.load, saveMode: storage.save }));

beforeEach(() => {
  storage.load.mockReset().mockResolvedValue('sample');
  storage.save.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('workspace mode selection', () => {
  it('restores the selected mode and saves a switch before changing the app', async () => {
    const user = userEvent.setup();
    storage.load.mockResolvedValue('workspace');
    const changed = vi.fn();
    const { container } = render(<WorkspaceModeControl onChange={changed} />);
    await waitFor(() => expect(screen.getByLabelText('Data source')).toHaveValue('workspace'));
    expect(changed).toHaveBeenLastCalledWith('workspace');
    await user.selectOptions(screen.getByLabelText('Data source'), 'sample');
    expect(storage.save).toHaveBeenCalledWith('sample');
    expect(changed).toHaveBeenLastCalledWith('sample');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('keeps the current mode when its write fails', async () => {
    const user = userEvent.setup();
    storage.save.mockRejectedValue(new Error('Storage is full.'));
    const changed = vi.fn();
    render(<WorkspaceModeControl onChange={changed} />);
    await waitFor(() => expect(changed).toHaveBeenCalledWith('sample'));
    changed.mockClear();
    await user.selectOptions(screen.getByLabelText('Data source'), 'workspace');
    expect(await screen.findByRole('alert')).toHaveTextContent('Data source could not be saved');
    expect(screen.getByLabelText('Data source')).toHaveValue('sample');
    expect(changed).not.toHaveBeenCalled();
  });

  it('reports unavailable browser storage', async () => {
    storage.load.mockRejectedValue(new Error('Storage unavailable.'));
    render(<WorkspaceModeControl onChange={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Browser storage is unavailable');
  });
});
