type Props = {
  title: string
  right?: React.ReactNode
  children: React.ReactNode
}

export function SectionCard({ title, right, children }: Props) {
  return (
    <section className="card">
      <div className="cardHeader">
        <div className="cardTitle">{title}</div>
        <div className="cardRight">{right}</div>
      </div>
      <div className="cardBody">{children}</div>
    </section>
  )
}
