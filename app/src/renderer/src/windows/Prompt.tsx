import { useEffect, useState } from 'react'
import { Monitor, X } from '../components/Icons'
import type { PromptView } from '../../../shared/types'
import { t } from '../../../shared/i18n'
import macIcon from '../../../../build/icon.png'

/** The small card that offers to take notes when a call starts, and asks whether to stop when it ends. */
export function Prompt() {
  const [view, setView] = useState<PromptView | null>(null)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [countdown, setCountdown] = useState(0)
  // off each time the card shows: reading the call's window is chosen per call
  const [screen, setScreen] = useState(false)
  // Screen Recording is off: the card says how to allow it (the call still records its sound)
  const [blocked, setBlocked] = useState(false)
  const toggleScreen = () => {
    const on = !screen
    setScreen(on)
    if (!on) setBlocked(false)
    void window.yogurt.prompt.screen(on).then(allowed => setBlocked(on && !allowed), () => {})
  }
  useEffect(() => { void window.yogurt.prompt.state().then(setView) }, [])
  useEffect(() => {
    if (view?.kind !== 'start' || hovered || focused) return
    // The bar and dismissal both restart after the person finishes interacting.
    setCountdown(cycle => cycle + 1)
    const timer = setTimeout(() => window.yogurt.prompt.act('close'), 12_000)
    return () => clearTimeout(timer)
  }, [view, hovered, focused])
  if (!view) return <div className="h-full bg-bg" />

  const start = view.kind === 'start'
  const name = start && view.app ? t('{app} call', { app: view.app }) : view.title || t('Meeting')
  return (
    <div data-testid="prompt" data-kind={view.kind} data-paused={hovered || focused} className="call-prompt"
      onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false) }}>
      {start && <span key={countdown} data-testid="prompt-countdown" className="call-prompt-countdown" aria-hidden="true" />}
      <div className="call-prompt-heading">
        <img src={macIcon} alt="" className="call-prompt-icon" />
        <div className="min-w-0 flex-1">
          <p data-testid="prompt-heading" className="call-prompt-label">{start ? t('Take notes?') : t('Stop recording?')}</p>
          <p data-testid="prompt-title" className="call-prompt-title" title={view.title || name}>{name}</p>
        </div>
      </div>
      <div className="call-prompt-actions">
        {start ? (
          <>
            {view.screen && (
              <button data-testid="prompt-screen" aria-pressed={screen} aria-label={t("Also read the call's screen")} title={t("Also read the call's screen")}
                className="ghost-btn workspace-icon call-prompt-screen" onClick={toggleScreen}>
                <Monitor size={16} aria-hidden="true" />
              </button>
            )}
            <button data-testid="prompt-take-notes" className="workspace-button" onClick={() => window.yogurt.prompt.act(screen ? 'take-notes-screen' : 'take-notes')}>
              {screen ? t('Record with screen') : t('Start recording')}
            </button>
          </>
        ) : (
          <>
            <button data-testid="prompt-keep-going" className="workspace-button" onClick={() => window.yogurt.prompt.act('keep-going')}>
              {t('Keep going')}
            </button>
            <button data-testid="prompt-stop" className="workspace-button primary" onClick={() => window.yogurt.prompt.act('stop')}>
              {t('Stop')}
            </button>
          </>
        )}
      </div>
      <button data-testid={start ? 'prompt-close' : 'prompt-dismiss-stop'} aria-label={t(start ? 'Not now' : 'Close')} title={start ? undefined : t('Close')} className="ghost-btn workspace-icon" onClick={() => window.yogurt.prompt.act('close')}>
        <X size={16} aria-hidden="true" />
      </button>
      {start && blocked && (
        <div data-testid="prompt-screen-access" className="call-prompt-screen-access" role="status">
          <p>{t('Allow screen recording for Yogurt, then reopen it when asked.')}</p>
          {/* screen recording shares call audio's pane (Screen & System Audio Recording) */}
          <button data-testid="prompt-screen-settings" className="workspace-button" onClick={() => void window.yogurt.permissions.open('systemAudio')}>{t('Open Settings')}</button>
        </div>
      )}
    </div>
  )
}
