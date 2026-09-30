"use client";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  hint?: string;
  className?: string;
}

export function Slider({ label, value, min, max, step, onChange, format, hint, className = "" }: SliderProps) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <label className={`block ${className}`}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink-2">{label}</span>
        <span className="tabular text-sm font-semibold">{format(value)}</span>
      </div>
      <input
        type="range"
        className="slider"
        style={{ "--fill": `${fill}%` } as React.CSSProperties}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </label>
  );
}
