'use server'

// Server actions for the account forms. They read the form, call src/lib/accounts.ts,
// and handle cookies and redirects.

import { redirect } from 'next/navigation'
import {
  checkLogin,
  registerAccount,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  verifyEmailToken,
  type FieldErrors,
} from '@/lib/accounts'
import { endSession, startSession } from '@/lib/auth/session'
import { safeNextPath } from '@/lib/auth/validation'

export type FormState = {
  error?: string
  fieldErrors?: FieldErrors
  message?: string
  values?: Record<string, string>
}

const text = (form: FormData, name: string) => String(form.get(name) ?? '')

export async function signupAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = { username: text(form, 'username'), email: text(form, 'email') }
  const result = await registerAccount({
    ...values,
    password: text(form, 'password'),
    confirm: text(form, 'confirm'),
    ageConfirmed: form.get('age') === 'on',
  })
  if (!result.ok) return { fieldErrors: result.errors, values }

  const params = new URLSearchParams({ email: result.email })
  if (!result.emailSent) params.set('failed', '1')
  redirect(`/check-email?${params}`)
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const identifier = text(form, 'identifier')
  const result = await checkLogin(identifier, text(form, 'password'))

  if (!result.ok) {
    const values = { identifier }
    if (result.reason === 'unverified') {
      return {
        values,
        error:
          'Your email isn’t verified yet. Forkful needs a verified email before you can log in. Use the link we emailed you, or send a new one below.',
        message: result.email ? `resend:${result.email}` : undefined,
      }
    }
    if (result.reason === 'disabled') {
      return { values, error: 'This account has been disabled by an administrator. Contact the Forkful team for help.' }
    }
    // REQ-9.2: one generic message for any wrong username, email, or password.
    return { values, error: 'Email or password is incorrect. Check them and try again, or reset your password.' }
  }

  await startSession(result.userId)
  redirect(safeNextPath(form.get('next')))
}

export async function logoutAction(): Promise<void> {
  await endSession()
  redirect('/')
}

export async function verifyAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ok = await verifyEmailToken(text(form, 'token'))
  if (!ok) {
    return {
      error:
        'This verification link doesn’t work. It may have expired (links last 24 hours) or already been used. Request a new link below.',
    }
  }
  redirect('/login?verified=1')
}

export async function resendAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = text(form, 'email')
  await resendVerification(email)
  return {
    values: { email },
    message: 'If that email has an account waiting for verification, a new link is on its way. Check your inbox and spam folder.',
  }
}

export async function forgotPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = text(form, 'email')
  await requestPasswordReset(email)
  return {
    values: { email },
    message: 'If that email has a Forkful account, a reset link is on its way. It expires in 1 hour. Check your spam folder too.',
  }
}

export async function resetPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const password = text(form, 'password')
  if (password !== text(form, 'confirm')) {
    return { fieldErrors: { confirm: 'The passwords don’t match. Both password fields must be the same. Type them again.' } }
  }
  const result = await resetPassword(text(form, 'token'), password)
  if (!result.ok) return { error: result.error }
  redirect('/login?reset=1')
}
