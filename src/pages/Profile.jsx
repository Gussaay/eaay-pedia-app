// ProfileActivity.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Camera, GraduationCap, LogOut, MapPin, Pencil, Clock } from 'lucide-react';
import { useAuth, logout } from '../hooks/useAuth';
import { updateAt, uploadImage } from '../lib/rtdb';
import BottomNav from '../components/BottomNav';
import { AppBar, Avatar, Button, Card, Confirm, Page, useToast } from '../components/ui';

export default function Profile() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [askLogout, setAskLogout] = useState(false);

  const changePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage('quizp', file);
      await updateAt(`quizusers/${user.uid}`, { img: url });
      toast('Profile photo updated', 'success');
    } catch (err) {
      toast(`Upload failed: ${err.message}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  const rows = [
    { icon: GraduationCap, label: 'Education level', value: profile?.level },
    { icon: MapPin, label: 'Country', value: profile?.residency },
    { icon: Clock, label: 'Last active', value: [profile?.date, profile?.time].filter(Boolean).join(' ') },
  ];

  return (
    <div className="min-h-screen pb-28">
      <AppBar title="My profile" back={false} />
      <Page className="space-y-4">
        <Card className="p-6 text-center">
          <div className="relative inline-block">
            <Avatar src={profile?.img} size={104} className="ring-4 ring-brand-100" />
            <label className="absolute bottom-0 right-0 h-9 w-9 rounded-full bg-brand-600 text-white flex items-center justify-center cursor-pointer shadow">
              <Camera size={18} />
              <input type="file" accept="image/*" className="hidden" onChange={changePhoto} disabled={uploading} />
            </label>
          </div>
          {uploading && <p className="text-xs text-slate-500 mt-2">Uploading…</p>}
          <h2 className="font-display text-xl mt-3">{profile?.name || 'No name yet'}</h2>
          <p className="text-sm text-slate-500">{user.email}</p>
        </Card>
        <Card className="divide-y divide-slate-100">
          {rows.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-3 p-4">
              <Icon size={20} className="text-brand-600" />
              <span className="text-slate-500 text-sm flex-1">{label}</span>
              <span className="text-slate-800 font-medium text-right">{value || '—'}</span>
            </div>
          ))}
        </Card>
        <div className="grid gap-3">
          <Button variant="secondary" onClick={() => navigate('/setup')}>
            <Pencil size={18} /> Edit information
          </Button>
          <Button variant="secondary" onClick={() => navigate('/performance')}>
            <BarChart3 size={18} /> My performance
          </Button>
          <Button variant="outline" className="!text-red-600" onClick={() => setAskLogout(true)}>
            <LogOut size={18} /> Sign out
          </Button>
        </div>
      </Page>
      <BottomNav />
      <Confirm
        open={askLogout}
        message="Do you want to sign out?"
        onCancel={() => setAskLogout(false)}
        onConfirm={async () => {
          setAskLogout(false);
          await logout();
          navigate('/login', { replace: true });
        }}
      />
    </div>
  );
}
