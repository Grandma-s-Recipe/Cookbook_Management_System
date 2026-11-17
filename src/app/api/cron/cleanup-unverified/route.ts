// Daily cleanup (REQ-8.8): deletes accounts never verified within 7 days,
// plus expired sessions and old used or expired email links.
//
// Vercel calls this once a day (see vercel.json) and sends
// "Authorization: Bearer <CRON_SECRET>" automatically. Anyone else gets 401.

import { cleanupExpired } from '@/lib/accounts'
import { sameHash } from '@/lib/auth/tokens'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization') ?? ''
  if (!secret || !sameHash(auth, `Bearer ${secret}`)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const deleted = await cleanupExpired()
  console.log('Daily cleanup:', deleted)
  return Response.json({ ok: true, deleted })
}
