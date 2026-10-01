import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import api from '../api/client';
import { useStore } from '../context/StoreContext';
import { LogoMark } from '../components/Logo';
import { track } from '../api/tracking';

function PasswordInput({ value, onChange, placeholder = 'Password', minLength }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-input">
      <input className="input" type={show ? 'text' : 'password'} required minLength={minLength} placeholder={placeholder}
        value={value} onChange={onChange} autoComplete={minLength ? 'new-password' : 'current-password'} />
      <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} title={show ? 'Hide password' : 'Show password'}>
        {show ? <FiEyeOff /> : <FiEye />}
      </button>
    </div>
  );
}

function AuthShell({ title, children }) {
  return (
    <div className="container page auth">
      <div className="card auth__card">
        <LogoMark className="auth__logo" />
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}

function useAuthSubmit(endpoint) {
  const { saveAuth } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const submit = async (body) => {
    setBusy(true);
    try {
      const res = await api.post(endpoint, body);
      saveAuth(res);
      if (endpoint.endsWith('register')) track.signUp();
      toast.success(`Welcome, ${res.user.name}!`);
      navigate(res.user.role === 'admin' ? '/admin' : location.state?.from || '/account');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return [submit, busy];
}

export function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [submit, busy] = useAuthSubmit('/auth/login');
  return (
    <AuthShell title="Login to your account">
      <form onSubmit={(e) => { e.preventDefault(); submit(form); }} className="stack">
        <input className="input" type="email" required placeholder="Email address" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <PasswordInput value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <button className="btn btn--gold btn--block" disabled={busy}>{busy ? 'Please wait...' : 'Login'}</button>
      </form>
      <p className="muted">New here? <Link to="/register" className="gold">Create an account</Link></p>
    </AuthShell>
  );
}

export function Register() {
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '' });
  const [submit, busy] = useAuthSubmit('/auth/register');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <AuthShell title="Create your account">
      <form onSubmit={(e) => { e.preventDefault(); submit(form); }} className="stack">
        <input className="input" required placeholder="Full name" value={form.name} onChange={set('name')} />
        <input className="input" placeholder="Phone number" value={form.phone} onChange={set('phone')} />
        <input className="input" type="email" required placeholder="Email address" value={form.email} onChange={set('email')} />
        <PasswordInput minLength={6} placeholder="Password (min 6 characters)" value={form.password} onChange={set('password')} />
        <button className="btn btn--gold btn--block" disabled={busy}>{busy ? 'Please wait...' : 'Register'}</button>
      </form>
      <p className="muted">Already have an account? <Link to="/login" className="gold">Login</Link></p>
    </AuthShell>
  );
}
