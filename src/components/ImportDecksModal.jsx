// Creating whole decks from one spreadsheet — title, system, cover image and
// all of the cards — instead of typing each deck into the New deck dialog and
// then uploading its cards separately.
//
// Nothing is written until the preview is confirmed, and the whole import is a
// single atomic write: a dropped connection never leaves a deck with half its
// cards, or a deck row with no cards at all.
import { useRef, useState } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, Layers, Upload } from 'lucide-react';
import { newKey, updatePaths } from '../lib/rtdb';
import { buildCardRecord, importableCards } from '../lib/flashcardImport';
import { DECK_TEMPLATE_HEADERS, buildDeckRecord, deckTemplateCsv, planDecks } from '../lib/deckImport';
import { Button, Modal, Thumb, Toggle, useToast } from './ui';

function downloadTemplate() {
  const blob = new Blob([deckTemplateCsv()], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'easy-pedia-decks-template.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ImportDecksModal({ source, existingDecks = [], onClose, onImported }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [parsed, setParsed] = useState(null);
  const [addToExisting, setAddToExisting] = useState(false);
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
      if (!wb.SheetNames.length) throw new Error('The file has no sheets.');
      // EVERY sheet is read: a workbook may be one tab per deck, or one sheet
      // with a `deck` column, or a mixture. Sheets with no cards fall away.
      const sheets = wb.SheetNames.map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false }),
      }));
      const result = planDecks(sheets, { existingDecks });
      if (!result.decks.length)
        throw new Error('No decks found. Each row needs a front and a back, plus a deck name or its own sheet.');
      setParsed({ ...result, fileName: file.name });
    } catch (err) {
      setError(err.message || String(err));
      setParsed(null);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  // A deck already in this book is skipped unless the toggle says to add its
  // cards to what is there — the default never touches an existing deck.
  const plan = (parsed?.decks || []).map((deck) => {
    const cards = importableCards(deck.items);
    return { ...deck, cards, skipped: !!deck.existing && !addToExisting };
  });
  const toWrite = plan.filter((d) => !d.skipped && d.cards.length);
  const totalCards = toWrite.reduce((n, d) => n + d.cards.length, 0);
  const broken = plan.reduce((n, d) => n + d.items.filter((i) => i.errors.length).length, 0);

  const save = async () => {
    if (!toWrite.length) return;
    setBusy(true);
    try {
      const updates = {};
      toWrite.forEach((deck) => {
        // An existing deck keeps its key and its cards; a new one gets a key.
        const deckId = deck.existing?._key || newKey('flashdecks');
        const already = Number(deck.existing?.count) || 0;

        if (deck.existing) {
          // Only the count moves, so an edit made in the app is not undone by
          // a re-upload of the same sheet.
          updates[`flashdecks/${deckId}/count`] = already + deck.cards.length;
        } else {
          updates[`flashdecks/${deckId}`] = buildDeckRecord(deck, {
            key: deckId,
            source,
            count: deck.cards.length,
          });
        }

        let order = already;
        deck.cards.forEach((item) => {
          order += 1;
          updates[`flashcard_items/${deckId}/${newKey(`flashcard_items/${deckId}`)}`] = buildCardRecord(item, {
            deckId,
            order,
          });
        });
      });

      await updatePaths(updates);
      toast(
        `${toWrite.length} deck${toWrite.length === 1 ? '' : 's'} and ${totalCards} card${totalCards === 1 ? '' : 's'} added.`,
        'success',
      );
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
      onClose={onClose}
      wide
      title="Upload decks from a file"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy} disabled={!toWrite.length}>
            <Upload size={16} /> Add {toWrite.length || ''} deck{toWrite.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      {!parsed && (
        <>
          <p className="text-slate-600">
            One file, every deck. Each row is a card; the <b>deck</b> column (or the sheet&rsquo;s own tab name) says
            which deck it belongs to, and the deck&rsquo;s details are read from the first row that carries them —{' '}
            <b>system</b>, <b>deck_topic</b>, <b>about</b>, <b>deck_image</b> and <b>order</b>.
          </p>
          <p className="text-sm text-slate-500 mt-2">
            The card columns are the usual ones: front, back, chapter, hint, note, tags. A <b>deck_image</b> is a link
            to a picture; decks without one show their initials, exactly as they do now.
          </p>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mt-4 w-full rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center hover:border-brand-400 hover:bg-brand-50/40 transition"
          >
            <FileSpreadsheet className="mx-auto text-slate-400" size={34} />
            <p className="font-semibold text-slate-700 mt-2">Choose a file</p>
            <p className="text-xs text-slate-400">.xlsx, .xls or .csv</p>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={pickFile}
          />

          <button
            type="button"
            onClick={downloadTemplate}
            className="mt-3 mx-auto flex items-center gap-1.5 text-sm text-brand-700 hover:underline"
          >
            <Download size={16} /> Download a template
          </button>
          <p className="text-xs text-slate-400 text-center mt-1">
            Columns: {DECK_TEMPLATE_HEADERS.join(', ')}
          </p>
        </>
      )}

      {parsed && (
        <div>
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <FileSpreadsheet size={16} /> {parsed.fileName}
          </p>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-emerald-50 p-3">
              <p className="font-display text-xl text-emerald-700">{toWrite.length}</p>
              <p className="text-xs text-emerald-800">decks</p>
            </div>
            <div className="rounded-xl bg-brand-50 p-3">
              <p className="font-display text-xl text-brand-700">{totalCards}</p>
              <p className="text-xs text-brand-800">cards</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-3">
              <p className="font-display text-xl text-amber-700">{plan.filter((d) => d.existing).length}</p>
              <p className="text-xs text-amber-800">already here</p>
            </div>
          </div>

          {plan.some((d) => d.existing) && (
            <div className="mt-3">
              <Toggle
                label="Add the cards to the decks that already exist"
                checked={addToExisting}
                onChange={setAddToExisting}
              />
              <p className="text-xs text-slate-500">
                Off by default: a deck whose title is already in this book is left completely alone.
              </p>
            </div>
          )}

          {broken > 0 && (
            <p className="mt-3 flex items-start gap-2 text-sm text-amber-800 bg-amber-50 rounded-xl p-3">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {broken} row{broken === 1 ? '' : 's'} had an empty front or back and will be left out.
            </p>
          )}

          {parsed.unknownHeaders.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              Columns not recognised and ignored: {parsed.unknownHeaders.join(', ')}.
            </p>
          )}

          <ul className="mt-4 divide-y divide-slate-100 max-h-72 overflow-auto">
            {plan.map((d) => (
              <li key={d.title} className="flex items-center gap-3 py-2.5">
                <Thumb src={d.img} label={d.title} className="h-10 w-10 text-sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800">{d.title}</p>
                  <p className="truncate text-xs text-slate-500">
                    {d.system || <span className="text-red-600">no system</span>}
                    {d.topic ? ` · ${d.topic}` : ''} · {d.cards.length} card{d.cards.length === 1 ? '' : 's'}
                    {d.publish === false ? ' · hidden' : ''}
                  </p>
                </div>
                {d.skipped ? (
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">skipped</span>
                ) : d.existing ? (
                  <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-800">adding</span>
                ) : (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">new</span>
                )}
              </li>
            ))}
          </ul>

          {plan.some((d) => !d.system && !d.skipped) && (
            <p className="mt-3 text-sm text-amber-800 bg-amber-50 rounded-xl p-3">
              Some decks have no <b>system</b>. They will still upload, but the progress and gaps screen groups by
              system, so they will sit apart from the rest until one is set.
            </p>
          )}

          <button
            type="button"
            onClick={() => setParsed(null)}
            className="mt-3 text-sm text-slate-500 hover:underline"
          >
            Choose a different file
          </button>
        </div>
      )}

      {error && (
        <p className="mt-3 flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-xl p-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      {!parsed && !error && (
        <p className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <Layers size={14} /> Nothing is saved until you confirm, and everything is written in one go.
        </p>
      )}
    </Modal>
  );
}
