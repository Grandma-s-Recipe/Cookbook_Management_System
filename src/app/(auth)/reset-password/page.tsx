import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { ResetPasswordForm } from '../forms'
import { first, type SearchParams } from '../params'

export const metadata: Metadata = { title: 'Choose a new password' }

export default function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <section className="narrow">
      <h1>Choose a new password</h1>
      <Suspense fallback={null}>
        <ResetContent searchParams={searchParams} />
      </Suspense>
    </section>
  )
}

async function ResetContent({ searchParams }: { searchParams: SearchParams }) {
  const token = first((await searchParams).token)
  if (!token) {
    return (
      <p className="notice notice-error" role="alert">
        This page needs the link from your reset email. <Link href="/forgot-password">Request a new reset link</Link>.
      </p>
    )
  }
  return (
    <>
      <p>After you save, you’ll be logged out everywhere and can log in with the new password.</p>
      <ResetPasswordForm token={token} />
    </>
  )
}
