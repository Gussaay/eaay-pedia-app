// SetprofileimageActivity: name, avatar (preset or upload), education level, country.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Check } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { updateAt, uploadImage } from '../lib/rtdb';
import { AVATARS, LEVELS } from '../config';
import { COUNTRIES } from '../data/countries';
import { AppBar, Avatar, Button, Card, Input, Page, Select, useToast } from '../components/ui';

// Old records were typed by hand in the Android app ("pediatric specialist",
// "sudan"), so match the dropdown options case-insensitively.
const matchOption = (options, value) => {
  const v = String(value || '').trim().toLowerCase();
  return options.find((o) => o.toLowerCase() === v) || '';
};

export default function ProfileSetup() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', img: '', level: '', residency: '' });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile)
      setForm((f) => ({
        name: f.name || profile.name || user.displayName || '',
        img: f.img || profile.img || '',
        level: f.level || matchOption(LEVELS, profile.level),
        residency: f.residency || matchOption(COUNTRIES, profile.residency),
      }));
  }, [profile, user]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage('quizp', file);
      setForm((f) => ({ ...f, img: url }));
    } catch (err) {
      toast(`Upload failed: ${err.message}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!form.img) return toast('Please choose an avatar', 'error');
    if (!form.residency) return toast('Please choose your country', 'error');
    if (!form.name.trim()) return toast('Please enter your full name', 'error');
    if (!form.level) return toast('Please choose your education level', 'error');
    setSaving(true);
    try {
      await updateAt(`quizusers/${user.uid}`, {
        img: form.img,
        name: form.name.trim(),
        residency: form.residency,
        level: form.level,
        mail: user.email || '',
        uid: user.uid,
      });
      toast('Information updated', 'success');
      navigate('/', { replace: true });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen">
      <AppBar title="Profile information" />
      <Page className="space-y-4">
        <Card className="p-5">
          <div className="flex flex-col items-center">
            <Avatar src={form.img} size={96} className="ring-4 ring-brand-100" />
            <p className="text-sm text-slate-500 mt-3 text-center">Choose an avatar or upload your own profile image</p>
            <div className="flex gap-3 mt-3 flex-wrap justify-center">
              {AVATARS.map((a) => (
                <button key={a} onClick={() => setForm((f) => ({ ...f, img: a }))} className="relative">
                  <Avatar src={a} size={56} className={form.img === a ? 'ring-4 ring-brand-500' : ''} />
                  {form.img === a && (
                    <Check size={16} className="absolute -top-1 -right-1 bg-brand-600 text-white rounded-full p-0.5" />
                  )}
                </button>
              ))}
            </div>
            <label className="mt-4 inline-flex items-center gap-2 text-brand-700 font-semibold cursor-pointer">
              <Camera size={18} /> {uploading ? 'Uploading…' : 'Upload profile image'}
              <input type="file" accept="image/*" className="hidden" onChange={upload} disabled={uploading} />
            </label>
          </div>
        </Card>
        <Card className="p-5">
          <Input label="Full name" placeholder="Your full name" value={form.name} onChange={set('name')} />
          <Select label="Education level" value={form.level} onChange={set('level')}>
            <option value="">Not set</option>
            {LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </Select>
          <Select label="Country" value={form.residency} onChange={set('residency')}>
            <option value="">Choose your country</option>
            {COUNTRIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Card>
        <Button className="w-full !py-3" onClick={save} loading={saving} disabled={uploading}>
          Save profile information
        </Button>
      </Page>
    </div>
  );
}
