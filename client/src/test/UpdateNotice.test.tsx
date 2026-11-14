import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpdateNotice } from '../local/UpdateNotice.js';
import { axe } from './axe.js';

const offline = vi.hoisted(() => ({ ready: false, activate: vi.fn() }));
vi.mock('../local/offline.js', () => ({ useUpdateState: () => ({ ready: offline.ready }), activateUpdate: offline.activate }));

afterEach(() => { cleanup(); offline.ready = false; offline.activate.mockReset(); });

describe('update notice', () => {
  it('shows nothing while no update is waiting, but keeps its live region', () => {
    const { container } = render(<UpdateNotice />);
    expect(screen.queryByText('A new version is ready.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reload' })).not.toBeInTheDocument();
    expect(container.querySelector('[role="status"]')).toBeEmptyDOMElement();
  });

  it('announces the update and only activates it when Reload is used', async () => {
    const user = userEvent.setup();
    offline.ready = true;
    const { container } = render(<UpdateNotice />);
    expect(screen.getByRole('status')).toHaveTextContent('A new version is ready.');
    expect(offline.activate).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(offline.activate).toHaveBeenCalledTimes(1);
  });
});
