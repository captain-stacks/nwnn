import { generateFeed } from '../../lib/generate-feed';

export default async function handler(req, res) {
  try {
    const url = 'https://nwnn.l484.com/api/links';

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.status}`);
    }
    const data = await response.json();

    if (!data?.success || !Array.isArray(data.links)) {
      throw new Error('Invalid data format from API');
    }

    // Use the shared feed generator with API-specific options
    const xml = generateFeed(data.links, {
      feed_url: 'https://nwnn.l484.com/api/feed'  // Override feed URL for API endpoint
    });

    // Generate feed using shared module
    const feedXml = generateFeed(data.links, {
      feed_url: 'https://nwnn.l484.com/api/feed'  // Use API-specific feed URL
    });    // Send response with appropriate headers
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8')
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate')
    res.status(200).send(xml)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
