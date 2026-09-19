import { useNavigate } from 'react-router-dom';
import { BarChart3, Info, LogOut, Megaphone, Shield, Share2, User, X } from 'lucide-react';
import { useAuth, logout } from '../hooks/useAuth';
import { shareApp } from '../lib/native';
import { APP_VERSION } from '../config';
import { Avatar } from './ui';

export default function Drawer({ open, onClose }) {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const go = (path) => {
    onClose();
    navigate(path);
  };
  const items = [
    { icon: User, label: 'My profile', action: () => go('/profile') },
    { icon: BarChart3, label: 'My performance', action: () => go('/performance') },
    { icon: Share2, label: 'Share the app', action: () => { onClose(); shareApp(); } },
    { icon: Megaphone, label: 'Official pages', action: () => go('/contact') },
    { icon: Info, label: 'About developer', action: () => go('/about') },
    { icon: Shield, label: 'Privacy policy', action: () => go('/privacy') },
  ];

  return (
    <div className={`fixed inset-0 z-40 ${open ? '' : 'pointer-events-none'}`}>
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <aside
        className={`absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-2xl flex flex-col transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="bg-gradient-to-br from-brand-700 to-brand-500 text-white p-5 pt-safe">
          <button className="float-right p-1 text-white/80" onClick={onClose} aria-label="Close menu">
            <X size={20} />
          </button>
          <Avatar src={profile?.img} size={64} className="ring-2 ring-white mt-2" />
          <p className="font-display text-lg mt-3 truncate">{profile?.name || 'Easy Pedia MCQs'}</p>
          <p className="text-xs text-white/80 truncate">{user?.email}</p>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {items.map(({ icon: Icon, label, action }) => (
            <button
              key={label}
              onClick={action}
              className="w-full flex items-center gap-4 px-5 py-3 text-slate-700 hover:bg-brand-50"
            >
              <Icon size={20} className="text-brand-600" /> {label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-100 pb-safe">
          <button
            onClick={async () => {
              onClose();
              await logout();
              navigate('/login', { replace: true });
            }}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-50 text-red-700 py-2.5 font-semibold"
          >
            <LogOut size={18} /> Sign out
          </button>
          <p className="text-center text-xs text-slate-400 mt-3">App version: {APP_VERSION}</p>
        </div>
      </aside>
    </div>
  );
}
