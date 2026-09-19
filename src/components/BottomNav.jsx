// Bottom tab bar for the four main sections (shown on those pages only).
import { NavLink } from 'react-router-dom';
import { BarChart3, Bell, Home, User } from 'lucide-react';

const TABS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/performance', label: 'Progress', icon: BarChart3 },
  { to: '/notifications', label: 'Alerts', icon: Bell },
  { to: '/profile', label: 'Profile', icon: User },
];

export default function BottomNav({ alertDot = false }) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 pb-safe">
      <div className="max-w-3xl mx-auto grid grid-cols-4">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition ${
                isActive ? 'text-brand-700' : 'text-slate-400 hover:text-slate-600'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`flex items-center justify-center h-8 w-14 rounded-full transition ${isActive ? 'bg-brand-50' : ''}`}>
                  <Icon size={21} strokeWidth={isActive ? 2.4 : 2} />
                </span>
                {label}
                {to === '/notifications' && alertDot && (
                  <span className="absolute top-2 left-1/2 ml-3 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
