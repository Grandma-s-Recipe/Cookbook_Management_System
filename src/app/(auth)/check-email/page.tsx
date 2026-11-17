import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ResendForm } from '../forms'
import { first, type SearchParams } from '../params'

export const metadata: Metadata = { title: 'Check your email' }

export default function CheckEmailPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <section className="narrow">
      <h1>Check your email</h1>
      <Suspense fallback={null}>
        <CheckEmailContent searchParams={searchParams} />
      </Suspense>
    </section>
  )
}

async function CheckEmailContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const email = first(params.email)
  const failed = first(params.failed)
  return (
    <>
      {failed ? (
        <p className="notice notice-error" role="alert">
          Your account was created, but the verification email couldn’t be sent. The email service may be down. Try
          sending a new link below in a few minutes.
        </p>
      ) : (
        <p>
          We sent a verification link to <strong>{email || 'your email address'}</strong>. Open it within 24 hours to
          finish creating your account. If you don’t see it, check your spam folder.
        </p>
      )}
      <p className="hint">You can’t log in until your email is verified. Unverified accounts are deleted after 7 days.</p>
      <ResendForm email={email} />
    </>
  )
}
