import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { FiCamera, FiEye, FiEyeOff, FiLogOut, FiTrash2 } from 'react-icons/fi';
import api, { imageUrl } from '../api/client';
import { useStore } from '../context/StoreContext';

export function PasswordInput({ value, onChange, ...rest }) {
  const [show, setShow] = useState(false);
  return (
    <span className="input-with-btn">
      <input className="input" type={show ? 'text' : 'password'} value={value} onChange={onChange} {...rest} />
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <FiEyeOff /> : <FiEye />}
      </button>
    </span>
  );
}

// 0–4 rough strength score shown under new-password fields
export const passwordStrength = (p) => {
  if (!p) return 0;
  let s = p.length >= 6 ? 1 : 0;
  if (p.length >= 10) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++;
  return s;
};
const STRENGTH = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];

export function StrengthMeter({ password }) {
  if (!password) return null;
  const s = passwordStrength(password);
  return (
    <span className="pw-meter">
      <span className={`pw-meter__bar pw-meter__bar--${s}`} style={{ width: `${(s / 4) * 100}%` }} />
      <small className="muted">{STRENGTH[s]}</small>
    </span>
  );
}

// Photo if the user has one, otherwise the first letter of their name
export function Avatar({ user, size }) {
  const style = size ? { width: size, height: size, fontSize: size * 0.4 } : undefined;
  if (user?.avatar) return <img className="avatar avatar--img" src={imageUrl(user.avatar)} alt={user.name} style={style} />;
  return <span className="avatar" style={style}>{user?.name?.[0]?.toUpperCase()}</span>;
}

function AvatarUpload() {
  const { user, setUser } = useStore();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const done = (u) => {
    setUser(u);
    localStorage.setItem('gah_user', JSON.stringify(u));
  };
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast.error('Image must be under 2 MB');
    const fd = new FormData();
    fd.append('image', file);
    setBusy(true);
    try {
      done(await api.post('/auth/avatar', fd));
      toast.success('Profile photo updated');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      done(await api.del('/auth/avatar'));
      toast.success('Profile photo removed');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="avatar-upload">
      <button type="button" className="avatar-upload__pic" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Change profile photo">
        <Avatar user={user} size={84} />
        <span className="avatar-upload__cam">{busy ? '…' : <FiCamera />}</span>
      </button>
      <div>
        <b>Profile Photo</b>
        <p className="muted small">JPG, PNG or WEBP, up to 2 MB.</p>
        <div className="row">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => fileRef.current?.click()} disabled={busy}>{user.avatar ? 'Change' : 'Upload'}</button>
          {user.avatar && <button type="button" className="btn btn--ghost btn--sm btn--danger" onClick={remove} disabled={busy}><FiTrash2 /> Remove</button>}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={pick} />
    </div>
  );
}

export function ProfileForm() {
  const { user, setUser } = useStore();
  const [form, setForm] = useState({ name: user.name || '', email: user.email || '', phone: user.phone || '', address: user.address || '', city: user.city || '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await api.put('/auth/me', form);
      setUser(u);
      localStorage.setItem('gah_user', JSON.stringify(u));
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save}>
      <h3>Profile</h3>
      <AvatarUpload />
      <div className="form-grid">
        <label>Name<input className="input" required value={form.name} onChange={set('name')} /></label>
        <label>Email<input className="input" type="email" required value={form.email} onChange={set('email')} /></label>
        <label>Phone<input className="input" value={form.phone} onChange={set('phone')} /></label>
        <label>City<input className="input" value={form.city} onChange={set('city')} /></label>
        <label className="span-2">Address<textarea className="input" rows={2} value={form.address} onChange={set('address')} /></label>
      </div>
      <button className="btn btn--gold" disabled={busy}>{busy ? 'Saving…' : 'Save Changes'}</button>
    </form>
  );
}

export function PasswordForm() {
  const { user, saveAuth, logout } = useStore();
  const empty = { current_password: '', new_password: '', confirm: '' };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const mismatch = form.confirm && form.confirm !== form.new_password;
  const save = async (e) => {
    e.preventDefault();
    if (form.new_password.length < 6) return toast.error('New password must be at least 6 characters');
    if (form.new_password !== form.confirm) return toast.error('New passwords do not match');
    setBusy(true);
    try {
      saveAuth(await api.put('/auth/password', { current_password: form.current_password, new_password: form.new_password }));
      setForm(empty);
      toast.success('Password changed. Other devices have been signed out.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  const logoutAll = async () => {
    if (!window.confirm('Sign out from all devices, including this one?')) return;
    try {
      await api.post('/auth/logout-all');
      toast.success('Signed out from all devices');
      logout();
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <>
      <form onSubmit={save}>
        <h3>Change Password</h3>
        {user.password_changed_at && <p className="muted small">Last changed {String(user.password_changed_at).slice(0, 10)}</p>}
        <div className="form-grid">
          <label className="span-2">Current Password
            <PasswordInput required autoComplete="current-password" value={form.current_password} onChange={set('current_password')} />
          </label>
          <label>New Password
            <PasswordInput required minLength={6} autoComplete="new-password" value={form.new_password} onChange={set('new_password')} />
            <StrengthMeter password={form.new_password} />
          </label>
          <label>Confirm New Password
            <PasswordInput required autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
            {mismatch && <small className="error-text">Passwords do not match</small>}
          </label>
        </div>
        <button className="btn btn--gold" disabled={busy || mismatch}>{busy ? 'Updating…' : 'Update Password'}</button>
      </form>
      <div className="danger-zone">
        <h3>Sessions</h3>
        <p className="muted small">Logged in on a shared or lost device? Sign out everywhere.</p>
        <button type="button" className="btn btn--ghost" onClick={logoutAll}><FiLogOut /> Sign out of all devices</button>
      </div>
    </>
  );
}
