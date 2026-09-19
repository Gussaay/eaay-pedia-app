// ContactPageActivity: official app pages.
import { Facebook } from 'lucide-react';
import { LINKS } from '../config';
import { openUrl } from '../lib/native';
import { AppBar, Page } from '../components/ui';

const PAGES = [
  { label: 'Facebook page', url: LINKS.facebookPage, icon: <Facebook className="h-10 w-10 text-[#1877F2]" /> },
  { label: 'WhatsApp channel', url: LINKS.whatsappChannel, icon: <img src="/img/whatsapp.png" alt="" className="h-10 w-10" /> },
  { label: 'Telegram channel', url: LINKS.telegramChannel, icon: <img src="/img/telegram.png" alt="" className="h-10 w-10" /> },
];

export default function Contact() {
  return (
    <div className="min-h-screen">
      <AppBar title="Official app pages" />
      <Page className="space-y-3">
        <p className="text-slate-600 text-sm">Follow Easy Pedia MCQs for new question banks, updates and announcements.</p>
        {PAGES.map((p) => (
          <button
            key={p.label}
            onClick={() => openUrl(p.url)}
            className="w-full flex items-center gap-4 bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-md"
          >
            {p.icon}
            <span className="font-semibold text-slate-800">{p.label}</span>
          </button>
        ))}
      </Page>
    </div>
  );
}
