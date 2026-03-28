type Props = {
  label: string
  optionValue: string
  selectedValue: string
  onChange: (v: string) => void
  name: string
}

export function RadioPill({ label, optionValue, selectedValue, onChange, name }: Props) {
  return (
    <label className="pill">
      <input
        className="pillInput"
        type="radio"
        name={name}
        checked={selectedValue === optionValue}
        onChange={() => onChange(optionValue)}
      />
      <span className="pillText">{label}</span>
    </label>
  )
}
