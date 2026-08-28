module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const keyword = req.query.q || 'wordpress';
  const upworkRss = `https://www.upwork.com/ab/feed/jobs/rss?q=${encodeURIComponent(keyword)}&sort=recency`;
  
  // Enrutamiento a través del proxy para omitir la IP de Vercel bloqueada
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(upworkRss)}`;

  try {
    const response = await fetch(proxyUrl);

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: `El proxy devolvió status: ${response.status}`
      });
    }

    const xmlText = await response.text();
    const items = xmlText.split('<item>').slice(1);

    const jobs = items.map(item => {
      const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/s) || item.match(/<title>(.*?)<\/title>/s);
      let title = titleMatch ? titleMatch[1].trim() : 'Sin título';
      title = title.replace(/^Upwork\s*-\s*/i, '');

      const linkMatch = item.match(/<link>(.*?)<\/link>/s);
      const link = linkMatch ? linkMatch[1].trim() : null;

      const descMatch = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/s) || item.match(/<description>(.*?)<\/description>/s);
      let rawDesc = descMatch ? descMatch[1] : '';
      
      const cleanDesc = rawDesc
        .replace(/<[^>]+>/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();

      const dateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/s);
      const pubDate = dateMatch ? dateMatch[1].trim() : '';

      return {
        title,
        link,
        pubDate,
        description: cleanDesc.substring(0, 200) + (cleanDesc.length > 200 ? '...' : '')
      };
    }).filter(job => job.link !== null);

    return res.status(200).json({
      success: true,
      query: keyword,
      count: jobs.length,
      data: jobs
    });

  } catch (error) {
    console.error('Error procesando scraping:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
