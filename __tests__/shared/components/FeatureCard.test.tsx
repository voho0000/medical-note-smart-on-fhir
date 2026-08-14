/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react"
import { Stethoscope } from "lucide-react"

import { FeatureCard } from "@/src/shared/components/FeatureCard"

describe("FeatureCard", () => {
  it("anchors the section title without restoring a full-height accent edge", () => {
    const { container } = render(
      <FeatureCard title="Patient information" icon={Stethoscope}>
        Clinical content
      </FeatureCard>,
    )

    const card = container.querySelector('[data-slot="card"]')
    const marker = container.querySelector(
      '[data-slot="clinical-section-marker"]',
    )

    expect(screen.getByText("Patient information")).toBeInTheDocument()
    expect(screen.getByText("Clinical content")).toBeInTheDocument()
    expect(card).toHaveClass("border-border")
    expect(card).not.toHaveClass("border-l-4")
    expect(marker).toHaveClass("h-4", "w-0.5", "bg-primary/70")
  })
})
