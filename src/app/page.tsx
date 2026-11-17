import Link from 'next/link'

export default function HomePage() {
  return (
    <section>
      <h1>Your recipes, all in one place</h1>
      <p className="lead">
        Browse the Forkful catalog, save a copy of any recipe and make it your own, and keep family recipes private
        in your Library.
      </p>
      <p className="actions">
        <Link href="/catalog" className="button-link">Browse the catalog</Link>
        <Link href="/signup">Create a free account</Link>
      </p>
    </section>
  )
}