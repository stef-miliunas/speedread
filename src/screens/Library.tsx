import { useEffect, useState } from 'react';
import { addBook, deleteBook, listBooks, type BookMeta } from '../lib/db';
import { tokenize } from '../lib/rsvp';
import { navigate } from '../lib/router';
import { useSettings } from '../lib/settings';
import { SAMPLE_TEXT, SAMPLE_TITLE } from '../lib/sample';

export function Library() {
  const { settings } = useSettings();
  const [books, setBooks] = useState<BookMeta[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const refresh = () => listBooks().then(setBooks);
  useEffect(() => {
    void refresh();
  }, []);

  const loadSample = async () => {
    const meta = await addBook(SAMPLE_TITLE, SAMPLE_TEXT, tokenize(SAMPLE_TEXT).length);
    navigate(`/read/${meta.id}`);
  };

  const remove = async (id: string) => {
    await deleteBook(id);
    setConfirmDelete(null);
    void refresh();
  };

  return (
    <div className="screen library-screen">
      <header className="app-header">
        <h1 className="wordmark">
          Speed<span className="wordmark-accent">Read</span>
        </h1>
        <div className="header-actions">
          <button className="icon-btn" onClick={() => navigate('/settings')} aria-label="Settings">
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path
                d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7zm7.4-2.1l1.7 1.3-1.7 3-2-.6a7.7 7.7 0 0 1-1.9 1.1l-.4 2.1h-3.4l-.4-2.1a7.7 7.7 0 0 1-1.9-1.1l-2 .6-1.7-3 1.7-1.3a7.8 7.8 0 0 1 0-2.8L4.7 9.3l1.7-3 2 .6a7.7 7.7 0 0 1 1.9-1.1l.4-2.1h3.4l.4 2.1a7.7 7.7 0 0 1 1.9 1.1l2-.6 1.7 3-1.7 1.3a7.8 7.8 0 0 1 0 2.8z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </header>

      {books === null ? null : books.length === 0 ? (
        <div className="empty-state">
          <div className="empty-glyph" aria-hidden="true">
            <span className="empty-rail" />
            <span className="empty-word">
              foc<span className="word-orp">u</span>s
            </span>
            <span className="empty-rail" />
          </div>
          <p className="empty-copy">
            One word at a time, at one fixed point. Your eyes stop moving; the text comes to you.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/import')}>
            Import something to read
          </button>
          <button className="btn btn-ghost" onClick={loadSample}>
            Try a sample chapter
          </button>
        </div>
      ) : (
        <>
          <ul className="book-list">
            {books.map((book) => {
              const pct = book.wordCount ? Math.min(100, Math.round((book.position / book.wordCount) * 100)) : 0;
              const minutes = Math.ceil((book.wordCount - book.position) / settings.wpm);
              return (
                <li key={book.id} className="book-card">
                  <button className="book-main" onClick={() => navigate(`/read/${book.id}`)}>
                    <span className="book-title">{book.title}</span>
                    <span className="book-sub">
                      {pct > 0 ? `${pct}% · ` : ''}
                      {minutes} min left at {settings.wpm} wpm
                    </span>
                    <span className="book-progress">
                      <span className="book-progress-fill" style={{ width: `${pct}%` }} />
                    </span>
                  </button>
                  {confirmDelete === book.id ? (
                    <div className="book-confirm">
                      <button className="btn-small btn-danger" onClick={() => remove(book.id)}>
                        Delete
                      </button>
                      <button className="btn-small" onClick={() => setConfirmDelete(null)}>
                        Keep
                      </button>
                    </div>
                  ) : (
                    <button
                      className="icon-btn book-delete"
                      onClick={() => setConfirmDelete(book.id)}
                      aria-label={`Delete ${book.title}`}
                    >
                      <svg viewBox="0 0 24 24" width="18" height="18">
                        <path
                          d="M5 7h14M10 7V5h4v2m-7 0l1 13h8l1-13"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <button className="fab" onClick={() => navigate('/import')} aria-label="Import text">
            <svg viewBox="0 0 24 24" width="24" height="24">
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
