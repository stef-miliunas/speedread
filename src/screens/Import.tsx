import { useRef, useState } from 'react';
import { addBook } from '../lib/db';
import { parseEpub } from '../lib/epub';
import { tokenize } from '../lib/rsvp';
import { goBack, navigate } from '../lib/router';

export function Import() {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async (bookTitle: string, bookText: string) => {
    const words = tokenize(bookText);
    if (words.length === 0) {
      setError('There are no words in that text.');
      return;
    }
    const finalTitle = bookTitle.trim() || words.slice(0, 5).join(' ') + '…';
    const meta = await addBook(finalTitle, bookText, words.length);
    navigate(`/read/${meta.id}`);
  };

  const onFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      if (/\.epub$/i.test(file.name)) {
        const parsed = await parseEpub(await file.arrayBuffer());
        await save(title || parsed.title, parsed.text);
      } else {
        const raw = await file.text();
        await save(title || file.name.replace(/\.[^.]+$/, ''), raw);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const wordCount = text.trim() ? tokenize(text).length : 0;

  return (
    <div className="screen import-screen">
      <header className="app-header">
        <button className="icon-btn" onClick={goBack} aria-label="Back">
          <svg viewBox="0 0 24 24" width="22" height="22">
            <path
              d="M15 5l-7 7 7 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <h1 className="screen-title">Import</h1>
        <span className="header-spacer" />
      </header>

      <div className="import-body">
        <label className="field-label" htmlFor="import-title">
          Title <span className="field-optional">optional</span>
        </label>
        <input
          id="import-title"
          className="text-input"
          type="text"
          value={title}
          placeholder="Untitled"
          onChange={(e) => setTitle(e.target.value)}
        />

        <label className="field-label" htmlFor="import-text">
          Paste text
        </label>
        <textarea
          id="import-text"
          className="text-area"
          value={text}
          placeholder="Paste an article, a chapter, anything…"
          onChange={(e) => setText(e.target.value)}
        />
        {wordCount > 0 && <p className="field-note">{wordCount.toLocaleString()} words</p>}

        <button
          className="btn btn-primary"
          disabled={busy || wordCount === 0}
          onClick={() => save(title, text)}
        >
          Add to library
        </button>

        <div className="import-divider">
          <span>or</span>
        </div>

        <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Reading file…' : 'Upload .txt or .epub'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.epub,text/plain,application/epub+zip"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
          }}
        />

        {error && <p className="field-error">{error}</p>}
      </div>
    </div>
  );
}
