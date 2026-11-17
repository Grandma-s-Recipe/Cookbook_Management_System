'use client'

// The account forms. Each one sends its fields to a server action in actions.ts
// and shows whatever error or message comes back (NFR-19: every action gives feedback).

import Link from 'next/link'
import { useActionState } from 'react'
import {
  forgotPasswordAction,
  loginAction,
  resendAction,
  resetPasswordAction,
  signupAction,
  verifyAction,
  type FormState,
} from './actions'

const initial: FormState = {}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="field-error" role="alert">
      {message}
    </p>
  )
}

function Status({ state }: { state: FormState }) {
  return (
    <>
      {state.error && (
        <p className="notice notice-error" role="alert">
          {state.error}
        </p>
      )}
      {state.message && !state.message.startsWith('resend:') && (
        <p className="notice notice-ok" role="status">
          {state.message}
        </p>
      )}
    </>
  )
}

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, initial)
  const f = state.fieldErrors ?? {}
  return (
    <form action={action} className="form" noValidate>
      <label htmlFor="username">Username</label>
      <input id="username" name="username" autoComplete="username" required
        defaultValue={state.values?.username} aria-invalid={!!f.username} aria-describedby="username-error" />
      <FieldError id="username-error" message={f.username} />

      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="email" required
        defaultValue={state.values?.email} aria-invalid={!!f.email} aria-describedby="email-error" />
      <FieldError id="email-error" message={f.email} />

      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8}
        aria-invalid={!!f.password} aria-describedby="password-hint password-error" />
      <p id="password-hint" className="hint">At least 8 characters.</p>
      <FieldError id="password-error" message={f.password} />

      <label htmlFor="confirm">Confirm password</label>
      <input id="confirm" name="confirm" type="password" autoComplete="new-password" required
        aria-invalid={!!f.confirm} aria-describedby="confirm-error" />
      <FieldError id="confirm-error" message={f.confirm} />

      <label className="checkbox">
        <input name="age" type="checkbox" aria-invalid={!!f.age} aria-describedby="age-error" />
        I am 13 years old or older.
      </label>
      <FieldError id="age-error" message={f.age} />

      <button type="submit" disabled={pending}>{pending ? 'Creating account…' : 'Create account'}</button>
      <p className="hint">
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </form>
  )
}

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, initial)
  const resendEmail = state.message?.startsWith('resend:') ? state.message.slice('resend:'.length) : null
  return (
    <>
      <form action={action} className="form">
        <Status state={state} />
        <input type="hidden" name="next" value={next} />

        <label htmlFor="identifier">Username or email</label>
        <input id="identifier" name="identifier" autoComplete="username" required defaultValue={state.values?.identifier} />

        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />

        <button type="submit" disabled={pending}>{pending ? 'Logging in…' : 'Log in'}</button>
        <p className="hint">
          <Link href="/forgot-password">Forgot your password?</Link> · <Link href="/signup">Create an account</Link>
        </p>
      </form>
      {resendEmail && <ResendForm email={resendEmail} />}
    </>
  )
}

export function ResendForm({ email = '' }: { email?: string }) {
  const [state, action, pending] = useActionState(resendAction, initial)
  return (
    <form action={action} className="form form-small">
      <Status state={state} />
      <label htmlFor="resend-email">Send a new verification link to</label>
      <input id="resend-email" name="email" type="email" required defaultValue={state.values?.email ?? email} />
      <button type="submit" disabled={pending}>{pending ? 'Sending…' : 'Send a new link'}</button>
    </form>
  )
}

export function VerifyForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(verifyAction, initial)
  return (
    <>
      <form action={action} className="form">
        <Status state={state} />
        <input type="hidden" name="token" value={token} />
        <button type="submit" disabled={pending}>{pending ? 'Verifying…' : 'Verify my email'}</button>
      </form>
      {state.error && <ResendForm />}
    </>
  )
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, initial)
  return (
    <form action={action} className="form">
      <Status state={state} />
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} />
      <button type="submit" disabled={pending}>{pending ? 'Sending…' : 'Send reset link'}</button>
    </form>
  )
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initial)
  const f = state.fieldErrors ?? {}
  return (
    <form action={action} className="form">
      <Status state={state} />
      {state.error && (
        <p className="hint">
          <Link href="/forgot-password">Request a new reset link</Link>
        </p>
      )}
      <input type="hidden" name="token" value={token} />

      <label htmlFor="password">New password</label>
      <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8}
        aria-describedby="password-hint" />
      <p id="password-hint" className="hint">At least 8 characters.</p>

      <label htmlFor="confirm">Confirm new password</label>
      <input id="confirm" name="confirm" type="password" autoComplete="new-password" required
        aria-invalid={!!f.confirm} aria-describedby="confirm-error" />
      <FieldError id="confirm-error" message={f.confirm} />

      <button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save new password'}</button>
    </form>
  )
}
