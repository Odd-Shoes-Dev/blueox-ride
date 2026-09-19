import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent } from '@/shared/ui/card'
import { PageContainer } from '@/shared/components/PageContainer'
import { SEO } from '@/shared/components/SEO'
import { LEGAL } from '@/domains/core/legal/legalConfig'

export interface LegalSection {
  id: string
  title: string
  content: ReactNode
}

interface LegalLayoutProps {
  title: string
  seoDescription: string
  path: string
  // Short plain-language overview shown before the full text.
  summary: ReactNode
  sections: LegalSection[]
  // Link to the sibling document ("Read our Terms of Use", etc.)
  related: { to: string; label: string }
}

// Shared page shell for legal documents: header, plain-language summary,
// table of contents, numbered sections. Content lives in the page files.
export function LegalLayout({ title, seoDescription, path, summary, sections, related }: LegalLayoutProps) {
  return (
    <>
      <SEO title={title} description={seoDescription} url={path} />
      <div className="min-h-screen bg-background pb-24">
        <div className="bg-header text-header-foreground pt-12 pb-8 px-4">
          <PageContainer>
            <Link
              to="/"
              className="inline-flex items-center text-header-foreground/80 hover:text-header-foreground mb-4"
            >
              <ArrowLeft className="w-5 h-5 mr-1" />
              Home
            </Link>
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="text-header-foreground/70 text-sm mt-1">Last updated: {LEGAL.lastUpdated}</p>
          </PageContainer>
        </div>

        <div className="px-4 mt-6">
          <PageContainer className="space-y-4">
            <Card>
              <CardContent className="p-5 text-sm leading-relaxed space-y-2">
                <p className="font-semibold">In short</p>
                <div className="text-foreground/85 space-y-2">{summary}</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="font-semibold text-sm mb-3">Contents</p>
                <ol className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                  {sections.map((section, index) => (
                    <li key={section.id}>
                      <a href={`#${section.id}`} className="text-primary hover:underline">
                        {index + 1}. {section.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 md:p-8 space-y-8">
                {sections.map((section, index) => (
                  <section key={section.id} id={section.id} className="scroll-mt-6">
                    <h2 className="text-lg font-semibold mb-3">
                      {index + 1}. {section.title}
                    </h2>
                    <div className="space-y-3 text-sm leading-relaxed text-foreground/85">{section.content}</div>
                  </section>
                ))}
              </CardContent>
            </Card>

            <p className="text-center text-sm text-muted-foreground">
              <Link to={related.to} className="text-primary hover:underline">
                {related.label}
              </Link>
              {' · '}
              <a href={`mailto:${LEGAL.supportEmail}`} className="text-primary hover:underline">
                {LEGAL.supportEmail}
              </a>
            </p>
          </PageContainer>
        </div>
      </div>
    </>
  )
}

export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="list-disc pl-5 space-y-1.5 marker:text-muted-foreground">{children}</ul>
}

export function LegalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
      {children}
    </a>
  )
}

export function SupportEmail() {
  return (
    <a href={`mailto:${LEGAL.supportEmail}`} className="text-primary hover:underline">
      {LEGAL.supportEmail}
    </a>
  )
}
