module.exports = async (req, res) => {
  // Configuración de cabeceras CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const keyword = req.query.q || 'wordpress';
  
  // Usar el token desde las variables de entorno o fallback directo
  const SCRAPE_DO_TOKEN = process.env.SCRAPE_DO_TOKEN || '3c2162fa0c8d46029d7a655532558984fad63d065db';

  // URL del Feed RSS de Upwork
  const targetUrl = `https://www.upwork.com/ab/feed/jobs/rss?q=${encodeURIComponent(keyword)}&sort=recency`;

  // Construir la URL de Scrape.do con super proxy habilitado para evadir Cloudflare
  const scrapeDoUrl = `https://api.scrape.do/?token=${SCRAPE_DO_TOKEN}&url=${encodeURIComponent(targetUrl)}&super=true`;

  try {
    const response = await fetch(scrapeDoUrl);

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: `Scrape.do devolvió un estado HTTP ${response.status}`
      });
    }

    const xmlText = await response.text();

    // Validar si la respuesta contiene XML de Upwork
    if (!xmlText.includes('<item>')) {
      return res.status(200).json({
        success: false,
        message: 'No se encontraron resultados o la estructura XML no fue reconocida.',
        rawPreview: xmlText.substring(0, 200)
      });
    }

    // Extraer y procesar cada oferta (<item>) del XML
    const items = xmlText.split('<item>').slice(1);

    const jobs = items.map(item => {
      // Extraer Título
      const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/s) || item.match(/<title>(.*?)<\/title>/s);
      let title = titleMatch ? titleMatch[1].trim() : 'Sin título';
      title = title.replace(/^Upwork\s*-\s*/i, '');

      // Extraer Enlace
      const linkMatch = item.match(/<link>(.*?)<\/link>/s);
      const link = linkMatch ? linkMatch[1].trim() : null;

      // Extraer Descripción breve
      const descMatch = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/s) || item.match(/<description>(.*?)<\/description>/s);
      let rawDesc = descMatch ? descMatch[1] : '';
      
      const cleanDesc = rawDesc
        .replace(/<[^>]+>/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();

      // Extraer Fecha de publicación
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
      provider: 'Scrape.do',
      count: jobs.length,
      data: jobs
    });

  } catch (error) {
    console.error('Error al realizar scraping:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
