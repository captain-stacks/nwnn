import RSS from 'rss'

export default async function handler(req, res) {
  try {
    const url = 'https://nwnn.l484.com/api/links'

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.status}`)
    }
    const data = await response.json()

    if (!data?.success || !Array.isArray(data.links)) {
      throw new Error('Invalid data format from API')
    }

    const feed = new RSS({
      title: 'Next Web News Network',
      description: 'Latest links from NWNN',
      feed_url: 'https://nwnn.l484.com/api/feed',
      site_url: 'https://nwnn.l484.com',
      language: 'en',
      pubDate: new Date(),
      custom_namespaces: {
        media: 'http://search.yahoo.com/mrss/'
      }
    })

    const guessImageMime = (img) => {
      if (!img) return undefined
      const lower = img.split('?')[0].toLowerCase()
      if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
      if (lower.endsWith('.png')) return 'image/png'
      if (lower.endsWith('.webp')) return 'image/webp'
      if (lower.endsWith('.gif')) return 'image/gif'
      return 'image/*'
    }

    for (const link of data.links) {
      const item = {
        title: link.title || 'Untitled',
        description: link.description || '',
        url: link.url,
        guid: link.id || link.url,
        date: link.createdAt ? new Date(link.createdAt) : new Date()
      }

      if (link.image) {
        const mime = guessImageMime(link.image)
        const attrs = { url: link.image, medium: 'image' }
        if (mime) attrs.type = mime

        item.custom_elements = [
          {
            'media:content': [
              { _attr: attrs }
            ]
          }
        ]
      }

      feed.item(item)
    }

    const xml = feed.xml({ indent: true })

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8')
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate')
    res.status(200).send(xml)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
