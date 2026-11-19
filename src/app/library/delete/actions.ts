'use server'
// Delete recipes after the user confirms (REQ-5.2, 5.4, 5.5).

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { deleteRecipes } from '@/lib/library'

export async function deleteRecipesAction(form: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent('/library')}`)

  const ids = form.getAll('id').filter((v): v is string => typeof v === 'string')
  let count: number
  try {
    count = await deleteRecipes(user.userId, ids) // only the user's own; any other id is ignored
  } catch (err) {
    console.error('Deleting recipes failed:', err)
    redirect('/library?deleteFailed=1')
  }
  redirect(`/library?deleted=${count}`)
}
