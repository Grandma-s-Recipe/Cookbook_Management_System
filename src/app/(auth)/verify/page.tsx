import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ResendForm, VerifyForm } from '../forms'
import { first, type SearchParams } from '../params'

export const metadata: Metadata = { title: 'Verify your email' }

// The link opens this page, and the user clicks a button to confirm. Verifying on
// page load would let email scanners that "preview" links use up the link.
export default function VerifyPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <section className="narrow">
      <h1>Verify your email</h1>
      <Suspense fallback={null}>
        <VerifyContent searchParams={searchParams} />
      </Suspense>
    </section>
  )
}

async function VerifyContent({ searchParams }: { searchParams: SearchParams }) {
  const token = first((await searchParams).token)
  if (!token) {
    return (
      <>
        <p className="notice notice-error" role="alert">
          This page needs the link from your verification email. Open the link from the email, or send a new one below.
        </p>
        <ResendForm />
      </>
    )
  }
  return (
    <>
      <p>Confirm this is your email address to finish creating your account.</p>
      <VerifyForm token={token} />
    </>
  )
}
