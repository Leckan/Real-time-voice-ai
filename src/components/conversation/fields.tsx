"use client";

import * as Switch from "@radix-ui/react-switch";
import * as Slider from "@radix-ui/react-slider";

export function Toggle({
  checked,
  onCheckedChange,
  label,
  hint,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-3">
      <span>
        <span className="block text-sm">{label}</span>
        {hint ? <span className="mt-1 block text-xs text-mist">{hint}</span> : null}
      </span>
      <Switch.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="relative h-6 w-11 rounded-full bg-panel-2 data-[state=checked]:bg-accent"
        aria-label={label}
      >
        <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-ink transition-transform data-[state=checked]:translate-x-5" />
      </Switch.Root>
    </label>
  );
}

export function VolumeSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Slider.Root
      key={value}
      className="relative flex h-6 w-full touch-none items-center"
      defaultValue={[value]}
      min={0}
      max={1}
      step={0.01}
      onValueCommit={(next) => onChange(next[0] ?? 0)}
      aria-label="Playback volume"
    >
      <Slider.Track className="relative h-1 grow rounded-full bg-panel-2">
        <Slider.Range className="absolute h-full rounded-full bg-accent" />
      </Slider.Track>
      <Slider.Thumb className="block h-4 w-4 rounded-full border border-line bg-ink" />
    </Slider.Root>
  );
}
