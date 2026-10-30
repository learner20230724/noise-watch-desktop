type Props = {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

export function RadioPill({ label, checked, onChange }: Props) {
  return (
    <label className="pill">
      <input
        className="pillInput"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="pillText">{label}</span>
    </label>
  )
}
