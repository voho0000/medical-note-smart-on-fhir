// Benefits Section Component
interface BenefitsSectionProps {
  title: string
  benefits: string[]
}

export function BenefitsSection({ title, benefits }: BenefitsSectionProps) {
  return (
    <div className="rounded-lg bg-muted p-3 text-sm">
      <p className="font-medium mb-1">✨ {title}</p>
      <ul className="space-y-1 text-muted-foreground">
        {benefits.map((benefit, index) => (
          <li key={index}>• {benefit}</li>
        ))}
      </ul>
    </div>
  )
}
