import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Profile' }

// Placeholder until §4.7 (User Profiles) is built.
export default function ProfilePage() {
  return (
    <section>
      <h1>Profile</h1>
      <p>Changing your username, email, password, and unit preference is coming in a later milestone.</p>
    </section>
  )
}
