import { useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { uploadImage } from '../lib/rtdb';
import { Thumb, useToast } from './ui';

/** Image picker that uploads to Firebase Storage `folder` and returns the URL. */
export default function ImageField({ label = 'Image', folder, value, onChange }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      onChange(await uploadImage(folder, file));
      toast('Uploaded successfully', 'success');
    } catch (err) {
      toast(`Upload failed: ${err.message}`, 'error');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };
  return (
    <div className="mb-3">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      <div className="flex items-center gap-3">
        <Thumb src={value} label="+" fallback="/img/logo.png" className="h-16 w-16" />
        <label className="inline-flex items-center gap-2 text-brand-700 font-semibold cursor-pointer">
          <ImagePlus size={18} /> {busy ? 'Uploading…' : value ? 'Change image' : 'Upload image'}
          <input type="file" accept="image/*" className="hidden" onChange={pick} disabled={busy} />
        </label>
      </div>
    </div>
  );
}
