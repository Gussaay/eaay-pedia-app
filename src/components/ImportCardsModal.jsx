// Bulk upload of flashcards (Excel .xlsx/.xls or .csv) into one deck.
//
// Nothing is written until the preview is confirmed, and the import is a
// single atomic write — a dropped connection never leaves half a deck behind.
import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { newKey, updatePaths } from '../lib/rtdb';
import {
  TEMPLATE_HEADERS,
  buildCardRecord,
  importableCards,
  parseCardRows,
  templateCsv,
} from '../lib/flashcardImport';
import { Button, Modal, Toggle, useToast } from './ui';

function downloadTemplate() {
  const blob = new Blob([templateCsv()], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'easy-pedia-flashcards-template.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ImportCardsModal({ deckId, existingCards = [], onClose, onImported }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [parsed, setParsed] = useState(null);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      // Loaded here only, so the sheet library stays out of the main bundle.
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error('The file has no sheets.');
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
      if (!rows.length) throw new Error('The first sheet has no rows.');
      const result = parseCardRows(rows, { existingCards });
      if (!result.items.length) throw new Error('No cards found. Check the column names.');
      setParsed({ ...result, fileName: file.name, sheet: wb.SheetNames[0] });
    } catch (err) {
      setError(err.message || String(err));
      setParsed(null);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const toImport = parsed ? importableCards(parsed.items, { includeDuplicates }) : [];
  const broken = parsed ? parsed.items.filter((i) => i.errors.length) : [];
  const duplicates = parsed ? parsed.items.filter((i) => i.duplicate && !i.errors.length) : [];

  const save = async () => {
    if (!toImport.length) return;
    setBusy(true);
    try {
      const updates = {};
      // New cards continue the deck's existing numbering, so an upload added
      // to a deck does not reshuffle what is already in it.
      let order = existingCards.length;
      toImport.forEach((item) => {
        order += 1;
        updates[`flashcard_items/${deckId}/${newKey(`flashcard_items/${deckId}`)}`] = buildCardRecord(item, {
          deckId,
          order,
        });
      });
      updates[`flashdecks/${deckId}/count`] = existingCards.length + toImport.length;

      await updatePaths(updates);
      toast(`${toImport.length} card${toImport.length === 1 ? '' : 's'} added.`, 'success');
      onImported?.();
      onClose();
    } catch (e) {
      setError(e.message || 'The upload failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={busy ? undefined : onClose}
      dismissable={!busy}
      wide
      title="Upload a set of cards"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!toImport.length} loading={busy}>
            <Upload size={18} /> Add {toImport.length || ''} card{toImport.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      {!parsed && (
        <div>
          <p className="text-slate-600">
            Pick an Excel or CSV file. The first sheet is read, and the columns can be named however
            your file names them — <b>front</b>/<b>question</b>/<b>term</b> and{' '}
            <b>back</b>/<b>answer</b>/<b>definition</b> are all understood.
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Optional columns: {TEMPLATE_HEADERS.slice(2).join(', ')}.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            A <b>chapter</b> column splits the deck up, so people can study just the chapters they
            choose. <b>Section</b>, <b>topic</b> and <b>sub-category</b> mean the same thing.
          </p>

          <button
            onClick={() => fileRef.current?.click()}
            className="mt-4 w-full rounded-2xl border-2 border-dashed border-slate-300 py-10 text-slate-500 transition hover:border-brand-400 hover:text-brand-600"
          >
            <FileSpreadsheet size={30} className="mx-auto" />
            <span className="mt-2 block font-semibold">Choose a file</span>
            <span className="text-xs text-slate-400">.xlsx, .xls or .csv</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,text/csv"
            className="hidden"
            onChange={pickFile}
          />

          <button
            onClick={downloadTemplate}
            className="mt-3 mx-auto flex items-center gap-2 text-sm font-semibold text-brand-700"
          >
            <Download size={16} /> Download a template
          </button>
        </div>
      )}

      {parsed && (
        <div>
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <FileSpreadsheet size={16} /> {parsed.fileName} · sheet “{parsed.sheet}”
          </p>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-emerald-50 p-3">
              <p className="font-display text-xl text-emerald-700">{toImport.length}</p>
              <p className="text-xs text-emerald-800">will be added</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-3">
              <p className="font-display text-xl text-amber-700">{duplicates.length}</p>
              <p className="text-xs text-amber-800">repeats</p>
            </div>
            <div className="rounded-xl bg-red-50 p-3">
              <p className="font-display text-xl text-red-700">{broken.length}</p>
              <p className="text-xs text-red-800">cannot be used</p>
            </div>
          </div>

          {parsed.skipped > 0 && (
            <p className="mt-3 text-sm text-slate-500">{parsed.skipped} empty row(s) ignored.</p>
          )}

          {parsed.unknownHeaders.length > 0 && (
            <p className="mt-3 flex gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-slate-400" />
              These columns were not recognised and will not be saved:{' '}
              <b>{parsed.unknownHeaders.join(', ')}</b>
            </p>
          )}

          {duplicates.length > 0 && (
            <div className="mt-3">
              <Toggle
                label={`Add the ${duplicates.length} repeated card(s) anyway`}
                checked={includeDuplicates}
                onChange={setIncludeDuplicates}
              />
            </div>
          )}

          {broken.length > 0 && (
            <div className="mt-3 rounded-xl bg-red-50 p-3">
              <p className="text-sm font-semibold text-red-800">
                These rows will be left out:
              </p>
              <ul className="mt-1.5 space-y-1 text-sm text-red-700">
                {broken.slice(0, 6).map((item) => (
                  <li key={item.row}>
                    Row {item.row}: {item.errors.join('; ')}
                  </li>
                ))}
                {broken.length > 6 && <li>…and {broken.length - 6} more.</li>}
              </ul>
            </div>
          )}

          {toImport.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-semibold text-slate-700">First few cards</p>
              <div className="mt-2 space-y-2">
                {toImport.slice(0, 4).map((item) => (
                  <div key={item.row} className="rounded-xl border border-slate-100 bg-white p-3">
                    <p className="text-sm font-medium text-slate-800 line-clamp-2">{item.record.front}</p>
                    <p className="mt-1 text-sm text-slate-500 line-clamp-2">{item.record.back}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => setParsed(null)}
            className="mt-4 text-sm font-semibold text-slate-500 hover:text-slate-700"
          >
            Choose a different file
          </button>
        </div>
      )}

      {error && (
        <p className="mt-3 flex gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      {!error && !parsed && (
        <p className="mt-3 flex gap-2 text-xs text-slate-400">
          <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
          Nothing is saved until you confirm, and everything is written in one go.
        </p>
      )}
    </Modal>
  );
}
