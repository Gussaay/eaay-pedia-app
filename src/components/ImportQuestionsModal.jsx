// Bulk import of a full question set (Excel .xlsx/.xls or .csv) into a quiz.
// Nothing is written until the preview is confirmed; the import is a single
// atomic write, so a failure never leaves half a question set behind.
import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, FileSpreadsheet, Upload } from 'lucide-react';
import { newKey, str, updatePaths } from '../lib/rtdb';
import {
  TEMPLATE_HEADERS,
  buildRecord,
  importableItems,
  parseRows,
  templateCsv,
} from '../lib/questionImport';
import { Button, Modal, Toggle, useToast } from './ui';

function downloadTemplate() {
  const blob = new Blob([templateCsv()], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'easy-pedia-questions-template.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ImportQuestionsModal({ quiz, childKey, existingQuestions, onClose, onImported }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [parsed, setParsed] = useState(null); // { items, skipped, unknownHeaders, fileName }
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      // Loaded only here so the sheet library stays out of the main bundle.
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error('The file has no sheets.');
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
      if (!rows.length) throw new Error('The first sheet has no rows.');
      const result = parseRows(rows, { existingQuestions });
      if (!result.items.length) throw new Error('No questions found. Check the column names.');
      setParsed({ ...result, fileName: file.name, sheet: wb.SheetNames[0] });
    } catch (err) {
      setError(err.message || String(err));
      setParsed(null);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const toImport = parsed ? importableItems(parsed.items, { includeDuplicates }) : [];
  const withErrors = parsed ? parsed.items.filter((i) => i.errors.length) : [];
  const duplicates = parsed ? parsed.items.filter((i) => i.duplicate && !i.errors.length) : [];

  const doImport = async () => {
    setBusy(true);
    setError('');
    try {
      const updates = {};
      toImport.forEach((item) => {
        updates[`quizqq/${newKey('quizqq')}`] = buildRecord(item, quiz);
      });
      // Keep the quiz's question counter in step with the new total.
      updates[`allquiz/${childKey}/number`] = str(existingQuestions.length + toImport.length);
      await updatePaths(updates);
      toast(`${toImport.length} questions imported`, 'success');
      onImported();
    } catch (err) {
      setError(`Import failed: ${err.message}. Nothing was saved.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Import questions"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={doImport} loading={busy} disabled={!toImport.length}>
            <Upload size={16} /> Import {toImport.length || ''} question{toImport.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      {!parsed && (
        <div className="text-center py-4">
          <FileSpreadsheet size={44} className="mx-auto text-brand-500" />
          <p className="text-slate-700 mt-3">
            Upload an Excel (.xlsx) or CSV file with one question per row, into
            <b> {quiz.title}</b>.
          </p>
          <p className="text-xs text-slate-500 mt-2">
            Columns: {TEMPLATE_HEADERS.join(', ')}. Column names are flexible (“Option A”, “correct answer”…),
            and extra columns are ignored.
          </p>
          <Button className="mt-5" onClick={() => fileRef.current?.click()} loading={busy}>
            <Upload size={18} /> Choose file
          </Button>
          <button className="block mx-auto mt-3 text-sm text-brand-700 underline" onClick={downloadTemplate}>
            Download template (CSV)
          </button>
        </div>
      )}

      {parsed && (
        <div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{parsed.fileName}</span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 font-semibold">
              {toImport.length} ready
            </span>
            {withErrors.length > 0 && (
              <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700 font-semibold">
                {withErrors.length} with problems
              </span>
            )}
            {duplicates.length > 0 && (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800 font-semibold">
                {duplicates.length} duplicates
              </span>
            )}
            <button className="ml-auto text-brand-700 underline" onClick={() => fileRef.current?.click()}>
              Choose another file
            </button>
          </div>

          {parsed.unknownHeaders.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              Ignored columns: {parsed.unknownHeaders.join(', ')}
            </p>
          )}

          {duplicates.length > 0 && (
            <div className="mt-3 rounded-xl bg-amber-50 p-3">
              <p className="text-sm text-amber-900 flex items-center gap-2">
                <Copy size={16} /> {duplicates.length} question{duplicates.length > 1 ? 's' : ''} look like
                duplicates and will be skipped.
              </p>
              <Toggle label="Import duplicates anyway" checked={includeDuplicates} onChange={setIncludeDuplicates} />
            </div>
          )}

          {withErrors.length > 0 && (
            <div className="mt-3 rounded-xl bg-red-50 p-3 max-h-40 overflow-y-auto">
              <p className="text-sm font-semibold text-red-800 flex items-center gap-2 mb-1">
                <AlertTriangle size={16} /> These rows will not be imported
              </p>
              <ul className="text-xs text-red-800 space-y-1">
                {withErrors.slice(0, 30).map((it) => (
                  <li key={it.row}>
                    Row {it.row}: {it.errors.join('; ')}
                  </li>
                ))}
                {withErrors.length > 30 && <li>…and {withErrors.length - 30} more</li>}
              </ul>
            </div>
          )}

          <p className="text-sm font-semibold text-slate-700 mt-4 mb-2">Preview</p>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
              {parsed.items.slice(0, 50).map((it) => {
                const bad = it.errors.length > 0;
                const skip = !bad && it.duplicate && !includeDuplicates;
                return (
                  <div key={it.row} className={`p-3 text-sm ${bad ? 'bg-red-50' : skip ? 'bg-amber-50' : ''}`}>
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-slate-400 w-10 shrink-0">#{it.row}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-slate-800 line-clamp-2">{it.record.question || <i>(no question)</i>}</p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          {['a', 'b', 'c', 'd', 'e']
                            .filter((k) => it.record[k])
                            .map((k) => `${k.toUpperCase()}. ${it.record[k]}`)
                            .join('  ·  ')}
                        </p>
                        {it.record.category1 && (
                          <p className="text-xs text-brand-700 mt-0.5">{it.record.category1}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-xs font-bold">
                        {bad ? (
                          <span className="text-red-600">✕</span>
                        ) : skip ? (
                          <span className="text-amber-600">dup</span>
                        ) : (
                          <span className="text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 size={14} /> {it.record.answer.toUpperCase()}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {parsed.items.length > 50 && (
            <p className="text-xs text-slate-400 mt-2">Showing the first 50 of {parsed.items.length} rows.</p>
          )}
          {parsed.skipped > 0 && (
            <p className="text-xs text-slate-400 mt-1">{parsed.skipped} empty row(s) ignored.</p>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={pickFile}
      />
    </Modal>
  );
}
