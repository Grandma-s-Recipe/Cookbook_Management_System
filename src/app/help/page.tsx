import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Help' }

// Placeholder: FAQ and how-to guides come later (§2.7). The privacy and terms
// sections are linked from every page (§6.4) and need real text before launch.
export default function HelpPage() {
  return (
    <section>
      <h1>Help</h1>
      <h2>Getting started</h2>
      <p>Create an account, verify your email, then save recipes from the catalog into your Library.</p>

      <h2 id="privacy">Privacy policy</h2>
      <p>Draft. Your private recipes are visible only to you, scans never leave your device, and you can delete your account and everything in it at any time.</p>

      <h2 id="terms">Terms of use</h2>
      <p>Draft. Forkful is a non-commercial class project. Catalog recipes link back to their source.</p>
    </section>
  )
}
