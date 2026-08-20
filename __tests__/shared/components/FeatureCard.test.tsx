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
    expect(card).toHaveClass("py-2", "md:py-3")
    expect(card).not.toHaveClass("border-l-4")
    expect(container.querySelector('[data-slot="card-content"]')).toHaveClass(
      "px-3",
      "sm:px-5",
    )
    expect(marker).toHaveClass("h-4", "w-0.5", "bg-primary/70")
  })

  it("keeps title help beside the title instead of creating a content row", () => {
    render(
      <FeatureCard
        title="Document summary"
        titleAccessory={<button aria-label="Document summary help">i</button>}
      >
        Document content
      </FeatureCard>,
    )

    const help = screen.getByRole("button", { name: "Document summary help" })
    expect(help.closest('[data-slot="card-title"]')).toBeInTheDocument()
    expect(help.closest('[data-slot="card-content"]')).toBeNull()
  })
})
