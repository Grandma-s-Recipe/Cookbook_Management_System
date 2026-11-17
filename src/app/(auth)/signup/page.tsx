import type { Metadata } from 'next'
import { SignupForm } from '../forms'

export const metadata: Metadata = { title: 'Create an account' }

export default function SignupPage() {
  return (
    <section className="narrow">
      <h1>Create an account</h1>
      <p>Save recipes from the catalog, edit your own copies, and keep private recipes in your Library.</p>
      <SignupForm />
    </section>
  )
}
