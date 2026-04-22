interface Props {
  visible: boolean;
  canShare: boolean;
  copied: boolean;
  onReplay: () => void;
  onReset: () => void;
  onCopy: () => void;
}

export function EndControls({
  visible,
  canShare,
  copied,
  onReplay,
  onReset,
  onCopy,
}: Props) {
  return (
    <div
      className={`corner-controls ${visible ? 'visible' : ''}`}
      aria-hidden={!visible}
      onClick={(e) => e.stopPropagation()}
    >
      {canShare && (
        <button
          type="button"
          className="corner-btn"
          onClick={onCopy}
          disabled={!visible}
          title="copy share link"
          aria-label="copy share link"
        >
          {copied ? 'copied' : 'share'}
        </button>
      )}
      <button
        type="button"
        className="corner-btn"
        onClick={onReplay}
        disabled={!visible}
        title="replay"
        aria-label="replay"
      >
        &#x21BB;
      </button>
      <button
        type="button"
        className="corner-btn"
        onClick={onReset}
        disabled={!visible}
        title="save someone else"
        aria-label="save someone else"
      >
        &#x2715;
      </button>
    </div>
  );
}
