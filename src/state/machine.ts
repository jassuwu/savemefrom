export type AppState =
  | { kind: 'idle' }
  | { kind: 'loading'; url: string }
  | { kind: 'ready'; url: string; readyAt: number }
  | { kind: 'slashing'; url: string; slashStart: number }
  | { kind: 'revealed'; url: string; revealedAt: number }
  | { kind: 'error'; url: string; message: string };

export const PRE_SLASH_DELAY_MS = 3500;

// How long we hold the 'slashing' state. Matches the tail of the video's
// greenscreen + white-flash phase, after which Vergil's scene has taken over.
export const SLASH_DURATION_MS = 1800;
