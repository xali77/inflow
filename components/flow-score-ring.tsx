"use client";

const SIZE = 180;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type Props = {
  verified: boolean;
  score?: number; // 0–100
  onVerify?: () => void;
};

export default function FlowScoreRing({ verified, score = 0, onVerify }: Props) {
  // Keep a sliver of arc visible at score 0 so the rounded cap reads as a ring.
  const progress = verified ? Math.max(score / 100, 0.02) : 0;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--color-line)"
            strokeWidth={STROKE}
            opacity={verified ? 1 : 0.5}
          />
          {verified && (
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {verified ? (
            <>
              <span className="text-4xl font-semibold tabular-nums">
                {score}
              </span>
              <span className="text-ink-soft text-xs">Month 0</span>
            </>
          ) : (
            <span className="text-ink-soft px-8 text-center text-sm">
              Verify you&rsquo;re you to start your score
            </span>
          )}
        </div>
      </div>

      {verified ? (
        <span className="border-accent/40 text-accent rounded-full border px-3 py-1 text-xs">
          1 person, 1 score
        </span>
      ) : (
        <button
          onClick={onVerify}
          className="rounded-xl border border-line bg-surface px-6 py-2.5 text-sm text-ink"
        >
          Verify
        </button>
      )}
    </div>
  );
}
