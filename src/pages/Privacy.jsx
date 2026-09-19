// PrivacyPolicyPageActivity (text shipped with the Android app).
import { ExternalLink } from 'lucide-react';
import { LINKS } from '../config';
import { openUrl } from '../lib/native';
import { AppBar, Card, Page } from '../components/ui';

const SECTIONS = [
  ['', 'Easy Pedia MCQs (the "App") is provided by Easy Medical Apps ("we" or "us") and is ad-supported. By using the App, you consent to the practices described in this policy.'],
  ['Information We Collect', '• Personal Information: We may collect personally identifiable information necessary for providing and improving the App.\n• Log Data: We collect information about your device and app usage to help us troubleshoot errors.\n• Profile Images: We may request access to your profile image solely for the purpose of enhancing your user experience within the App, such as displaying it alongside your username or activity. We do not share your profile image with any third parties.'],
  ['How We Use Information', 'We use collected information to:\n• Provide, maintain, and improve the App.\n• Troubleshoot errors and address technical issues.\n• Personalize your experience within the App.'],
  ['Third-Party Services', 'We use the following third-party services that may collect data:\n• Google Play Services\n• AdMob\n• Google Analytics for Firebase\nPlease refer to their respective privacy policies for more information.'],
  ['Security', 'We take reasonable precautions to protect your information, but no data transmission over the internet is 100% secure.'],
  ["Children's Privacy", 'The App is not intended for children under 13. We do not knowingly collect personal information from children.'],
  ['Changes to This Policy', 'We may update this policy from time to time. We encourage you to review it periodically for any changes.'],
  ['Contact Us', 'If you have any questions or suggestions about this Privacy Policy, please contact us at easymedicalapps@gmail.com.'],
];

export default function Privacy() {
  return (
    <div className="min-h-screen">
      <AppBar title="Privacy policy" />
      <Page>
        <Card className="p-6 space-y-4">
          {SECTIONS.map(([h, body]) => (
            <section key={h || 'intro'}>
              {h && <h2 className="font-display text-lg text-slate-900 mb-1">{h}</h2>}
              <p className="text-slate-700 whitespace-pre-line leading-relaxed">{body}</p>
            </section>
          ))}
          <button onClick={() => openUrl(LINKS.privacyPolicy)} className="text-brand-700 text-sm inline-flex items-center gap-1">
            Online version <ExternalLink size={14} />
          </button>
        </Card>
      </Page>
    </div>
  );
}
