module.exports = async (req, res) => {
  // Configurar cabeceras CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const keyword = req.query.q || 'wordpress';
  
  // URL del Feed RSS público de búsqueda de Upwork
  const rssUrl = `https://www.upwork.com/ab/feed/jobs/rss?q=${encodeURIComponent(keyword)}&sort=recency`;

  try {
    // Usamos el fetch nativo de Node.js (disponible sin dependencias)
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: `Error al conectar con Upwork: Status ${response.status}`
      });
    }

    const xmlText = await response.text();

    // Extraer cada elemento <item> del XML del RSS
    const items = xmlText.split('<item>').slice(1);

    const jobs = items.map(item => {
      // Extraer Título
      const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/s) || item.match(/<title>(.*?)<\/title>/s);
      let title = titleMatch ? titleMatch[1].trim() : 'Sin título';
      
      // Limpiar prefijo habitual de Upwork en los RSS
      title = title.replace(/^Upwork\s*-\s*/i, '');

      // Extraer Enlace
      const linkMatch = item.match(/<link>(.*?)<\/link>/s);
      const link = linkMatch ? linkMatch[1].trim() : null;

      // Extraer Descripción breve
      const descMatch = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/s) || item.match(/<description>(.*?)<\/description>/s);
      let rawDesc = descMatch ? descMatch[1] : '';
      
      // Limpiar etiquetas HTML de la descripción
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
      source: 'Upwork RSS Feed',
      count: jobs.length,
      data: jobs
    });

  } catch (error) {
    console.error('Error procesando el Feed de Upwork:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
