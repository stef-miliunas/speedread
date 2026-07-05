import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getBook, getText, updatePosition, type BookMeta } from '../lib/db';
import { chunkDelay, chunkify, orpIndex, rampSpeed, tokenize } from '../lib/rsvp';
import { clampWpm, useSettings, WPM_MAX, WPM_MIN, WPM_STEP } from '../lib/settings';
import { goBack } from '../lib/router';

export function Reader({ bookId }: { bookId: string }) {
  const { settings, update } = useSettings();
  const [meta, setMeta] = useState<BookMeta | null>(null);
  const [words, setWords] = useState<string[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [chunkIndex, setChunkIndex] = useState(0);

  const chunkSize = settings.chunk;
  const chunks = useMemo(
    () => (words ? chunkify(words, chunkSize) : []),
    [words, chunkSize]
  );

  const indexRef = useRef(0);
  const rampRef = useRef(0);
  const lastSavedRef = useRef(-1);

  const setIndex = useCallback((i: number) => {
    indexRef.current = i;
    setChunkIndex(i);
  }, []);

  // Load book + text, restore position.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [m, text] = await Promise.all([getBook(bookId), getText(bookId)]);
      if (cancelled) return;
      if (!m || text === undefined) {
        setMissing(true);
        return;
      }
      const w = tokenize(text);
      setMeta(m);
      setWords(w);
      const start = Math.min(Math.floor(m.position / settings.chunk), Math.ceil(w.length / settings.chunk));
      indexRef.current = start;
      setChunkIndex(start);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  const wordPosition = useCallback(
    (i: number) => Math.min(i * chunkSize, words?.length ?? 0),
    [chunkSize, words]
  );

  const persist = useCallback(
    (i: number) => {
      const pos = wordPosition(i);
      if (pos === lastSavedRef.current) return;
      lastSavedRef.current = pos;
      void updatePosition(bookId, pos);
    },
    [bookId, wordPosition]
  );

  // Playback loop: display the current chunk for its computed duration,
  // then advance. Re-created when wpm/chunks change, which simply
  // re-times the current chunk.
  useEffect(() => {
    if (!playing || chunks.length === 0) return;
    let timer = 0;
    const step = () => {
      const i = indexRef.current;
      if (i >= chunks.length) {
        setPlaying(false);
        return;
      }
      const delay = chunkDelay(chunks[i], settings.wpm) / rampSpeed(rampRef.current);
      rampRef.current += 1;
      timer = window.setTimeout(() => {
        const next = indexRef.current + 1;
        setIndex(next);
        if (next % 20 === 0) persist(next);
        if (next >= chunks.length) {
          setPlaying(false);
          persist(next);
        } else {
          step();
        }
      }, delay);
    };
    step();
    return () => window.clearTimeout(timer);
  }, [playing, chunks, settings.wpm, persist, setIndex]);

  // Save position when pausing, when the tab hides, and on unmount.
  useEffect(() => {
    if (!playing && words) persist(indexRef.current);
  }, [playing, words, persist]);
  useEffect(() => {
    const onHide = () => persist(indexRef.current);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      persist(indexRef.current);
    };
  }, [persist]);

  const togglePlay = useCallback(() => {
    setPlaying((was) => {
      if (!was) {
        rampRef.current = 0;
        if (indexRef.current >= chunks.length) setIndex(0);
      }
      return !was;
    });
  }, [chunks.length, setIndex]);

  // Space toggles on desktop; arrows skip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') skip(-10);
      else if (e.code === 'ArrowRight') skip(10);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [togglePlay, chunks.length]);

  const skip = (deltaWords: number) => {
    const delta = Math.round(deltaWords / chunkSize) || Math.sign(deltaWords);
    const next = Math.max(0, Math.min(chunks.length - 1, indexRef.current + delta));
    rampRef.current = 0;
    setIndex(next);
  };

  const adjustWpm = (delta: number) => {
    update({ wpm: clampWpm(settings.wpm + delta) });
    rampRef.current = 0;
  };

  if (missing) {
    return (
      <div className="screen reader-screen">
        <div className="reader-empty">
          <p>This book is no longer in your library.</p>
          <button className="btn" onClick={goBack}>
            Back
          </button>
        </div>
      </div>
    );
  }

  if (!words || !meta) {
    return <div className="screen reader-screen" />;
  }

  const finished = chunkIndex >= chunks.length;
  const displayIndex = Math.min(chunkIndex, chunks.length - 1);
  const chunk = chunks[displayIndex] ?? '';
  const progress = chunks.length ? Math.min(1, chunkIndex / chunks.length) : 0;
  const wordsLeft = Math.max(0, words.length - wordPosition(chunkIndex));
  const minutesLeft = wordsLeft / settings.wpm;

  return (
    <div className={`screen reader-screen ${playing ? 'is-playing' : ''}`}>
      <header className="reader-top chrome">
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
        <span className="reader-title">{meta.title}</span>
        <span className="reader-pct">{Math.round(progress * 100)}%</span>
      </header>

      <div
        className="stage"
        onClick={togglePlay}
        role="button"
        aria-label={playing ? 'Pause' : 'Play'}
      >
        <div className="rail rail-top" />
        {finished && !playing ? (
          <div className="word-done">
            <span className="done-mark">fin</span>
            <span className="done-sub">tap to read again</span>
          </div>
        ) : (
          <WordDisplay chunk={chunk} fontScale={settings.fontScale} />
        )}
        <div className="rail rail-bottom" />
        {!playing && !finished && (
          <div className="tap-hint" aria-hidden="true">
            tap to {chunkIndex > 0 ? 'resume' : 'begin'}
          </div>
        )}
      </div>

      <div className="reader-bottom chrome">
        <div className="stats-row">
          <span className="stat wpm-stepper">
            <button
              className="wpm-btn"
              onClick={() => adjustWpm(-WPM_STEP)}
              disabled={settings.wpm <= WPM_MIN}
              aria-label="Slower"
            >
              −
            </button>
            <span>
              <strong>{settings.wpm}</strong> wpm
            </span>
            <button
              className="wpm-btn"
              onClick={() => adjustWpm(WPM_STEP)}
              disabled={settings.wpm >= WPM_MAX}
              aria-label="Faster"
            >
              +
            </button>
          </span>
          <span className="stat-divider" />
          <span className="stat">
            <strong>{formatTime(minutesLeft)}</strong> left
          </span>
          <span className="stat-divider" />
          <span className="stat">
            <strong>{wordsLeft.toLocaleString()}</strong> words
          </span>
        </div>

        <input
          className="scrubber"
          type="range"
          min={0}
          max={Math.max(chunks.length - 1, 0)}
          value={displayIndex}
          onChange={(e) => {
            rampRef.current = 0;
            setIndex(Number(e.target.value));
          }}
          aria-label="Position"
        />

        <div className="transport">
          <div className="transport-main">
            <button className="icon-btn skip-btn" onClick={() => skip(-10)} aria-label="Back 10 words">
              <SkipIcon back />
            </button>
            <button className="play-btn" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? (
                <svg viewBox="0 0 24 24" width="26" height="26">
                  <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
                  <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="26" height="26">
                  <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
                </svg>
              )}
            </button>
            <button className="icon-btn skip-btn" onClick={() => skip(10)} aria-label="Forward 10 words">
              <SkipIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SkipIcon({ back = false }: { back?: boolean }) {
  return (
    <span className="skip-icon">
      <svg viewBox="0 0 24 24" width="20" height="20" style={back ? undefined : { transform: 'scaleX(-1)' }}>
        <path
          d="M11 6l-6 6 6 6M19 6l-6 6 6 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="skip-label">10</span>
    </span>
  );
}

function WordDisplay({ chunk, fontScale }: { chunk: string; fontScale: number }) {
  const orp = orpIndex(chunk);
  const pre = chunk.slice(0, orp);
  const letter = chunk.charAt(orp);
  const post = chunk.slice(orp + 1);

  // Fit long words: the ORP letter is pinned to screen center, so the
  // constraint is the longer half. ~0.58em average glyph width for the
  // reading serif.
  const halfLen = Math.max(pre.length, post.length) + 0.6;
  const viewport = Math.min(window.innerWidth, 700);
  const fitPx = (0.46 * viewport) / (0.58 * halfLen);
  const sizePx = Math.max(18, Math.min(52 * fontScale, fitPx));

  return (
    <div className="word" style={{ fontSize: `${sizePx}px` }}>
      <span className="word-pre">{pre}</span>
      <span className="word-orp">{letter}</span>
      <span className="word-post">{post}</span>
    </div>
  );
}

function formatTime(minutes: number): string {
  if (minutes < 1) return `${Math.max(0, Math.round(minutes * 60))}s`;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
}
