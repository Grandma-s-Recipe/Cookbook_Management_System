import type { Metadata } from 'next'
import { Suspense } from 'react'
import { safeNextPath } from '@/lib/auth/validation'
import { LoginForm } from '../forms'
import { first, type SearchParams } from '../params'

export const metadata: Metadata = { title: 'Log in' }

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <section className="narrow">
      <h1>Log in</h1>
      <Suspense fallback={null}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </section>
  )
}

async function LoginContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  return (
    <>
      {first(params.verified) && (
        <p className="notice notice-ok" role="status">Your email is verified. You can log in now.</p>
      )}
      {first(params.reset) && (
        <p className="notice notice-ok" role="status">Your password was changed. Log in with your new password.</p>
      )}
      {first(params.expired) && (
        <p className="notice" role="status">You were logged out after 30 minutes without activity. Log in again to continue.</p>
      )}
      <LoginForm next={safeNextPath(first(params.next) || '/')} />
    </>
  )
}
