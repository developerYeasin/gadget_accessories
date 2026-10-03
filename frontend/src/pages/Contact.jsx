import { useState } from 'react';
import { FiMail, FiMapPin, FiPhone } from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa';
import toast from 'react-hot-toast';
import api, { waLink } from '../api/client';
import { useStore } from '../context/StoreContext';
import { Breadcrumb } from '../components/Shared';

export default function Contact() {
  const { settings } = useStore();
  const empty = { name: '', email: '', phone: '', subject: '', message: '' };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post('/contact', form);
      toast.success(res.message);
      setForm(empty);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container page">
      <Breadcrumb items={[['Contact']]} />
      <h1 className="page-title">Contact <span className="gold">Us</span></h1>
      <div className="contact">
        <div className="card form-card contact__info">
          <h3>Get in touch</h3>
          <p><FiPhone className="gold" /> {settings.phone || '01411612350'}</p>
          <p><FaWhatsapp className="gold" /> WhatsApp: <a href={waLink(settings)} target="_blank" rel="noreferrer" className="gold">{settings.whatsapp || settings.phone}</a></p>
          <p><FiMail className="gold" /> {settings.email}</p>
          <p><FiMapPin className="gold" /> {settings.address}</p>
          <p className="muted small">Support hours: 10:00 AM – 10:00 PM, every day.</p>
        </div>
        <form className="card form-card" onSubmit={submit}>
          <div className="form-grid">
            <label>Name *<input className="input" required value={form.name} onChange={set('name')} /></label>
            <label>Phone<input className="input" value={form.phone} onChange={set('phone')} /></label>
            <label>Email<input className="input" type="email" value={form.email} onChange={set('email')} /></label>
            <label>Subject<input className="input" value={form.subject} onChange={set('subject')} /></label>
            <label className="span-2">Message *<textarea className="input" required rows={5} value={form.message} onChange={set('message')} /></label>
          </div>
          <button className="btn btn--gold" disabled={busy}>{busy ? 'Sending...' : 'Send Message'}</button>
        </form>
      </div>
    </div>
  );
}
