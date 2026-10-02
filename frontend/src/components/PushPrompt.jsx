import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FiBell, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { permission, pushSupported, subscribePush } from '../api/push';

const DISMISS_KEY = 'gah_push_dismissed_at';
const SNOOZE_DAYS = 14;
const SHOW_AFTER_MS = 25000;

const snoozed = () => {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return at && Date.now() - at < SNOOZE_DAYS * 864e5;
  } catch {
    return false;
  }
};

// Soft prompt for offers & order updates — only asks the browser after the visitor clicks "Allow"
export default function PushPrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    if (!pushSupported() || permission() !== 'default' || snoozed()) return undefined;
    const t = setTimeout(() => setShow(true), SHOW_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  if (!show || ['/checkout', '/login', '/register'].includes(pathname)) return null;

  const later = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    setShow(false);
  };
  const allow = async () => {
    setBusy(true);
    try {
      await subscribePush();
      toast.success("You'll get offers & order updates");
      setShow(false);
    } catch (err) {
      toast.error(err.message);
      later();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="push-prompt" role="dialog" aria-label="Enable notifications">
      <button className="push-prompt__close" onClick={later} aria-label="Close"><FiX /></button>
      <span className="push-prompt__icon"><FiBell /></span>
      <div>
        <b>Don't miss a deal</b>
        <p>Get flash sale alerts and your order updates.</p>
        <div className="row">
          <button className="btn btn--gold btn--sm" onClick={allow} disabled={busy}>{busy ? 'Please wait…' : 'Allow'}</button>
          <button className="btn btn--ghost btn--sm" onClick={later}>Later</button>
        </div>
      </div>
    </div>
  );
}
