import { goBack } from '../lib/router';
import { clampWpm, useSettings, WPM_MAX, WPM_MIN, WPM_STEP } from '../lib/settings';

export function Settings() {
  const { settings, update } = useSettings();

  return (
    <div className="screen settings-screen">
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
        <h1 className="screen-title">Settings</h1>
        <span className="header-spacer" />
      </header>

      <div className="settings-body">
        <section className="setting">
          <div className="setting-head">
            <span className="setting-name">Reading speed</span>
            <span className="setting-value">{settings.wpm} wpm</span>
          </div>
          <input
            type="range"
            className="slider"
            min={WPM_MIN}
            max={WPM_MAX}
            step={WPM_STEP}
            value={settings.wpm}
            onChange={(e) => update({ wpm: clampWpm(Number(e.target.value)) })}
          />
        </section>

        <section className="setting">
          <div className="setting-head">
            <span className="setting-name">Word size</span>
            <span className="setting-value">{Math.round(settings.fontScale * 100)}%</span>
          </div>
          <input
            type="range"
            className="slider"
            min={0.7}
            max={1.5}
            step={0.05}
            value={settings.fontScale}
            onChange={(e) => update({ fontScale: Number(e.target.value) })}
          />
        </section>

        <section className="setting">
          <div className="setting-head">
            <span className="setting-name">Words at a time</span>
          </div>
          <div className="segmented">
            {([1, 2] as const).map((n) => (
              <button
                key={n}
                className={`segment ${settings.chunk === n ? 'is-active' : ''}`}
                onClick={() => update({ chunk: n })}
              >
                {n}
              </button>
            ))}
          </div>
        </section>

        <section className="setting">
          <div className="setting-head">
            <span className="setting-name">Theme</span>
          </div>
          <div className="segmented">
            {(['dark', 'light'] as const).map((t) => (
              <button
                key={t}
                className={`segment ${settings.theme === t ? 'is-active' : ''}`}
                onClick={() => update({ theme: t })}
              >
                {t === 'dark' ? 'Dark' : 'Light'}
              </button>
            ))}
          </div>
        </section>

        <p className="settings-footnote">
          Everything lives on this device — your books, positions and settings never leave the
          browser.
        </p>
      </div>
    </div>
  );
}
