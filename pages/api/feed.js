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

    const makeAbsoluteImage = (img) => {
      if (!img) return undefined
      try {
        // If img is already absolute, this returns it unchanged; if it's relative, this resolves against the site
        return new URL(img, 'https://nwnn.l484.com').toString()
      } catch (e) {
        // Fallback string concat
        if (img.startsWith('/')) return `https://nwnn.l484.com${img}`
        return `https://nwnn.l484.com/${img}`
      }
    }

    const escapeHtml = (str) => {
      if (!str) return ''
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
    }

    for (const link of data.links) {
      const item = {
        title: link.title || 'Untitled',
        description: link.description || '',
        url: link.url,
        guid: link.id || link.url,
        date: link.createdAt ? new Date(link.createdAt) : new Date()
      }

      // If this is a Telegram-sourced item, ensure the image is an absolute URL
      let description = link.description || ''

      // If this is an item from x.com, prefer the messageText field for the article text
      if (link.domain === 'x.com' && link.messageText) {
        description = link.messageText
      }
      if (link.domain === 'telegram' && link.image) {
        const fullImage = makeAbsoluteImage(link.image)
        const mime = guessImageMime(fullImage)

        // Embed image in the description (article text)
        const alt = escapeHtml(link.title || 'image')
        const imgHtml = `<p><img src="${fullImage}" alt="${alt}" /></p>`
        // Append the image so it appears at the end of the article text
        if (description) {
          description = description + '\n' + imgHtml
        } else {
          description = imgHtml
        }

        // Add media:content using the absolute image URL
        const attrs = { url: fullImage, medium: 'image' }
        if (mime) attrs.type = mime

        item.custom_elements = [
          {
            'media:content': [
              { _attr: attrs }
            ]
          }
        ]
      } else if (link.image) {
        // Non-telegram images: keep existing behavior
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

      // Assign description after possibly modifying it above
      item.description = description

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
