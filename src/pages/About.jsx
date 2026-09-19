// AboutMeActivity.
import { Facebook, Linkedin, Twitter } from 'lucide-react';
import { LINKS } from '../config';
import { openUrl } from '../lib/native';
import { AppBar, Card, Page } from '../components/ui';

export default function About() {
  return (
    <div className="min-h-screen">
      <AppBar title="About developer" />
      <Page>
        <Card className="p-6 text-center">
          <img src="/img/qusay.png" alt="Dr. Qusay Mohamed" className="h-32 w-32 rounded-full object-cover mx-auto ring-4 ring-brand-100" />
          <h2 className="font-display text-2xl mt-4">Dr. Qusay Mohamed</h2>
          <p className="text-slate-600 mt-2">
            Sudanese pediatrician with interest in medical education and use of information technology to improve child health.
          </p>
          <p className="text-sm font-semibold text-slate-500 mt-6">Follow me on</p>
          <div className="flex justify-center gap-4 mt-3">
            {[
              [LINKS.devFacebook, <Facebook key="f" />, 'bg-[#1877F2]'],
              [LINKS.devTwitter, <Twitter key="t" />, 'bg-sky-500'],
              [LINKS.devLinkedin, <Linkedin key="l" />, 'bg-[#0A66C2]'],
            ].map(([url, icon, bg]) => (
              <button key={url} onClick={() => openUrl(url)} className={`h-12 w-12 rounded-full text-white flex items-center justify-center ${bg}`}>
                {icon}
              </button>
            ))}
          </div>
        </Card>
      </Page>
    </div>
  );
}
