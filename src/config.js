// App-wide constants ported from the Android app.

// Same admin accounts that were hard-coded in the Android activities.
// NOTE: this only controls what the UI shows. Real protection must come from
// the Realtime Database security rules.
export const ADMIN_EMAILS = ['gussaay@gmail.com', 'malazmuzamil55@gmail.com'];
// Only this account could add new categories / sources in the Android app.
export const SUPER_ADMIN_EMAIL = 'gussaay@gmail.com';

// Android used current_version = "5". The Capacitor build is version 6, so
// setting update/app/ver = 6 in the database prompts old Android users to update.
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '6.0.0';
export const APP_VERSION_NUMBER = parseFloat(APP_VERSION);

// Web app + permanent APK download (published by .github/workflows/deploy.yml).
export const SITE_URL = 'https://easy-pedia.web.app';
export const APK_URL = `${SITE_URL}/download/easy-pedia-mcqs.apk`;
export const APK_URL_GITHUB =
  'https://github.com/Gussaay/eaay-pedia-app/releases/latest/download/easy-pedia-mcqs.apk';
export const RELEASES_URL = 'https://github.com/Gussaay/eaay-pedia-app/releases';
export const NATIVE_VERSION_URL = `${SITE_URL}/native-version.json`;

export const GOOGLE_WEB_CLIENT_ID =
  '444201218220-ub2mt5dcl5557vp3f608gqltnvhfovlp.apps.googleusercontent.com';

export const LEVELS = ['Medical student', 'pediatric Resident', 'pediatric Specialist'];

// Preset avatars (same Firebase Storage URLs the Android app used).
export const AVATARS = [
  'https://firebasestorage.googleapis.com/v0/b/easy-pedia.appspot.com/o/apk%2Fchild-girl-notice-clipart-md.png?alt=media&token=ac507e54-0edf-47cd-bc70-3863430f3447',
  'https://firebasestorage.googleapis.com/v0/b/easy-pedia.appspot.com/o/apk%2Fhappy-boy-clipart-md.png?alt=media&token=9c7e6438-bd57-4d79-a543-324e09b7cab4',
  'https://firebasestorage.googleapis.com/v0/b/easy-pedia.appspot.com/o/apk%2Fdoodle-avatar-girl-cartoon-character-cute-vector.jpg?alt=media&token=e73ccadf-4a4e-4ac4-8bbe-8c3eb111699a',
  'https://firebasestorage.googleapis.com/v0/b/easy-pedia.appspot.com/o/apk%2Fboy-clipart-md.png?alt=media&token=83484f67-de8a-48d6-880a-7d51709fcb97',
];

export const LINKS = {
  whatsappDev: 'https://wa.me/249123541617',
  telegramDev: 'https://t.me/Drqusay',
  emailDev: 'mailto:gussaay@gmail.com',
  facebookPage: 'https://www.facebook.com/easypediatric?mibextid=ZbWKwL',
  whatsappChannel: 'https://whatsapp.com/channel/0029VagZsFG6WaKkkvxi730u',
  telegramChannel: 'https://t.me/pedia_mcqs',
  devFacebook: 'https://www.facebook.com/Qussaay',
  devTwitter: 'https://twitter.com/gussaay',
  devLinkedin: 'https://www.linkedin.com/in/gussaay',
  privacyPolicy: 'https://easy-pediatric.blogspot.com/2023/07/easy-pedia-mcqs-privacy-policy.html?m=1',
};

export const isAdminEmail = (email) => !!email && ADMIN_EMAILS.includes(email.toLowerCase());
