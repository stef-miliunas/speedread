import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getBook, getText, updatePosition, type BookMeta } from '../lib/db';
import {
  chunkDelay,
  chunkify,
  orpIndex,
  paragraphStarts,
  rampSpeed,
  sentenceStart,
  tokenize,
} from '../lib/rsvp';
import { clampWpm, useSettings, WPM_MAX, WPM_MIN, WPM_STEP } from '../lib/settings';
import { goBack } from '../lib/router';

export function Reader({ bookId }: { bookId: string }) {
  const { settings, update } = useSettings();
  const [meta, setMeta] = useState<BookMeta | null>(null);
  const [words, setWords] = useState<string[] | null>(null);
  const [paraStarts, setParaStarts] = useState<number[]>([]);
  const [missing, setMissing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);

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
      setParaStarts(paragraphStarts(text));
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
      // Never save before the text has loaded: wordPosition clamps to 0
      // while `words` is null, which would clobber the stored position
      // (StrictMode's double-mount cleanup hits this path in dev).
      if (!words) return;
      const pos = wordPosition(i);
      if (pos === lastSavedRef.current) return;
      lastSavedRef.current = pos;
      void updatePosition(bookId, pos);
    },
    [bookId, wordPosition, words]
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
    // Backgrounded tabs throttle setTimeout to roughly once a second, so a
    // playing reader left in the background would "catch up" with a burst
    // of words on return. Pausing on hide keeps the position honest.
    const onVisibility = () => {
      persist(indexRef.current);
      if (document.hidden) setPlaying(false);
    };
    const onPageHide = () => persist(indexRef.current);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      persist(indexRef.current);
    };
  }, [persist]);

  const togglePlay = useCallback(() => {
    setPlaying((was) => {
      if (!was) {
        rampRef.current = 0;
        if (indexRef.current >= chunks.length) setIndex(0);
        else if (indexRef.current > 0 && words) {
          // Re-enter at the start of the current sentence so a pause
          // doesn't drop you back in mid-thought.
          const wi = sentenceStart(words, Math.min(indexRef.current * chunkSize, words.length - 1));
          setIndex(Math.floor(wi / chunkSize));
        }
      }
      return !was;
    });
  }, [chunks.length, setIndex, words, chunkSize]);

  // Space toggles on desktop; arrows skip. While zoomed out, only Escape
  // (close overlay) is handled so Space doesn't restart playback.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (zoomed) {
        if (e.code === 'Escape') setZoomed(false);
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') skip(-10);
      else if (e.code === 'ArrowRight') skip(10);
      else if (e.code === 'ArrowUp') {
        e.preventDefault();
        adjustWpm(WPM_STEP);
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        adjustWpm(-WPM_STEP);
      } else if (e.code === 'BracketLeft') skipParagraph(-1);
      else if (e.code === 'BracketRight') skipParagraph(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [togglePlay, chunks.length, zoomed, settings.wpm, paraStarts]);

  const skip = (deltaWords: number) => {
    const delta = Math.round(deltaWords / chunkSize) || Math.sign(deltaWords);
    const next = Math.max(0, Math.min(chunks.length - 1, indexRef.current + delta));
    rampRef.current = 0;
    setIndex(next);
  };

  // Jump to the next/previous paragraph boundary — a quick way to hop
  // over front matter, credits, or a stray section without opening the
  // full zoom-out view.
  const skipParagraph = (direction: 1 | -1) => {
    if (paraStarts.length === 0 || !words) return;
    const curWord = indexRef.current * chunkSize;
    let targetWord: number;
    if (direction > 0) {
      targetWord = paraStarts.find((p) => p > curWord) ?? words.length;
    } else {
      const before = paraStarts.filter((p) => p < curWord - 1);
      targetWord = before.length ? before[before.length - 1] : 0;
    }
    const next = Math.max(0, Math.min(chunks.length - 1, Math.round(targetWord / chunkSize)));
    rampRef.current = 0;
    setIndex(next);
  };

  const adjustWpm = (delta: number) => {
    update({ wpm: clampWpm(settings.wpm + delta) });
    rampRef.current = 0;
  };

  const openZoom = () => {
    setPlaying(false);
    setZoomed(true);
  };

  const jumpToWord = (wordIdx: number) => {
    const ci = Math.max(0, Math.min(chunks.length - 1, Math.floor(wordIdx / chunkSize)));
    rampRef.current = 0;
    setIndex(ci);
    persist(ci);
    setZoomed(false);
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
        <button className="icon-btn" onClick={openZoom} aria-label="Zoom out to text">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
            <path
              d="M7.5 10.5h6M15.5 15.5L21 21"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
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
            <button
              className="icon-btn para-btn"
              onClick={() => skipParagraph(-1)}
              aria-label="Previous paragraph"
            >
              <ParaSkipIcon back />
            </button>
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
            <button
              className="icon-btn para-btn"
              onClick={() => skipParagraph(1)}
              aria-label="Next paragraph"
            >
              <ParaSkipIcon />
            </button>
          </div>
        </div>
      </div>

      {zoomed && (
        <ZoomOverlay
          words={words}
          current={wordPosition(displayIndex)}
          chunkSize={chunkSize}
          onJump={jumpToWord}
          onClose={() => setZoomed(false)}
        />
      )}
    </div>
  );
}

/** How many words the zoom view shows around the current position, and how
 * many more each "earlier / later" tap reveals. Windowed so a full novel
 * never renders 100k spans at once. */
const ZOOM_WINDOW = 400;
const ZOOM_EXTEND = 600;

function ZoomOverlay({
  words,
  current,
  chunkSize,
  onJump,
  onClose,
}: {
  words: string[];
  current: number;
  chunkSize: number;
  onJump: (wordIdx: number) => void;
  onClose: () => void;
}) {
  const [start, setStart] = useState(() => Math.max(0, current - ZOOM_WINDOW));
  const [end, setEnd] = useState(() => Math.min(words.length, current + ZOOM_WINDOW));
  const currentRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'center' });
  }, []);

  // One delegated handler instead of a listener per word span.
  const onBodyClick = (e: React.MouseEvent) => {
    const hit = (e.target as HTMLElement).closest('[data-i]');
    if (hit) onJump(Number(hit.getAttribute('data-i')));
  };

  return (
    <div className="zoom-overlay">
      <header className="zoom-top">
        <span className="zoom-hint">tap a word to jump there</span>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>
      <div className="zoom-body" onClick={onBodyClick}>
        {start > 0 && (
          <button className="zoom-more" onClick={() => setStart((s) => Math.max(0, s - ZOOM_EXTEND))}>
            ⌃ earlier
          </button>
        )}
        <p className="zoom-text">
          {words.slice(start, end).map((w, k) => {
            const i = start + k;
            const isCurrent = i >= current && i < current + chunkSize;
            return (
              <span
                key={i}
                data-i={i}
                ref={i === current ? currentRef : undefined}
                className={isCurrent ? 'zoom-word is-current' : 'zoom-word'}
              >
                {w}{' '}
              </span>
            );
          })}
        </p>
        {end < words.length && (
          <button
            className="zoom-more"
            onClick={() => setEnd((e2) => Math.min(words.length, e2 + ZOOM_EXTEND))}
          >
            later ⌄
          </button>
        )}
      </div>
    </div>
  );
}

function ParaSkipIcon({ back = false }: { back?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      style={back ? undefined : { transform: 'scaleX(-1)' }}
    >
      <path
        d="M13 5l-6 7 6 7M19 5l-6 7 6 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M4 4v16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
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
