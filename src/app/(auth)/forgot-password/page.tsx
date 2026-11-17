import type { Metadata } from 'next'
import { ForgotPasswordForm } from '../forms'

export const metadata: Metadata = { title: 'Reset your password' }

export default function ForgotPasswordPage() {
  return (
    <section className="narrow">
      <h1>Reset your password</h1>
      <p>Enter the email for your account and we’ll send you a link to choose a new password.</p>
      <ForgotPasswordForm />
    </section>
  )
}
