import { headers } from 'next/headers'

type YTEmbedProps = {
	id: string
}

async function getOrigin() {
	const h = await headers()
	const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost'
	const proto = h.get('x-forwarded-proto') ?? 'https'
	return `${proto}://${host}`
}

export default async function YTEmbed({ id }: YTEmbedProps) {
	const origin = await getOrigin()
	return (
		<iframe
			id="ytplayer"
			title="YouTube video player"
			src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&controls=0&enablejsapi=1&origin=${origin}`}
			allow="autoplay; fullscreen"
			allowFullScreen
			style={{ border: 0, height: '100vh', width: '100vw' }}
		/>
	)
}
