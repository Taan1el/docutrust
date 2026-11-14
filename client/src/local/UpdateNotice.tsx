import { activateUpdate, useUpdateState } from './offline.js';
import './update.css';

/** Quiet notice shown when a new version waits. Nothing reloads until the button is used. */
export function UpdateNotice() {
  const { ready } = useUpdateState();
  return <div className="update-notice" role="status">
    {ready && <div className="update-notice-inner">
      <p>A new version is ready.</p>
      <button type="button" className="btn btn-secondary" onClick={activateUpdate}>Reload</button>
    </div>}
  </div>;
}
