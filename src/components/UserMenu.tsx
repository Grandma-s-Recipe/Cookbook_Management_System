// Right side of the header: who is logged in, and Log out (REQ-9.3), or Log in / Sign up.
// Reads the session cookie, so the layout wraps it in <Suspense>.

import Link from 'next/link'
import { logoutAction } from '@/app/(auth)/actions'
import { getCurrentUser } from '@/lib/auth/session'

export async function UserMenu() {
  const user = await getCurrentUser()
  if (!user) {
    return (
      <div className="user-menu">
        <Link href="/login">Log in</Link>
        <Link href="/signup" className="button-link">Sign up</Link>
      </div>
    )
  }
  return (
    <div className="user-menu">
      <span className="signed-in">
        Signed in as <strong>{user.username}</strong>
        {user.role === 'admin' && ' (admin)'}
      </span>
      <form action={logoutAction}>
        <button type="submit" className="link-button">Log out</button>
      </form>
    </div>
  )
}
