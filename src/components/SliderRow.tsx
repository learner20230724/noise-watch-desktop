type Props = {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
  rightText?: string
}

export function SliderRow({ label, min, max, step, value, onChange, rightText }: Props) {
  return (
    <div className="row">
      <div className="rowLabel">{label}</div>
      <input
        className="slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="rowRight">{rightText ?? value}</div>
    </div>
  )
}
