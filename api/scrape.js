module.exports = async (req, res) => {
  // Configuración de cabeceras CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const keyword = req.query.q || 'wordpress';
  const SCRAPE_DO_TOKEN = process.env.SCRAPE_DO_TOKEN || '3c2162fa0c8d46029d7a655532558984fad63d065db';

  // Apuntamos a la URL de búsqueda web de Upwork
  const targetUrl = `https://www.upwork.com/nx/search/jobs/?q=${encodeURIComponent(keyword)}&sort=recency`;

  // Se omitió render=true para evitar el timeout de 10s de Vercel.
  // super=true + geoCode=us enruta la petición por residencial de EE.UU. rápido.
  const scrapeDoUrl = `https://api.scrape.do/?token=${SCRAPE_DO_TOKEN}&url=${encodeURIComponent(targetUrl)}&super=true&geoCode=us`;

  try {
    const response = await fetch(scrapeDoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: `Scrape.do devolvió estado HTTP ${response.status}`
      });
    }

    const htmlText = await response.text();

    // Verificación de bloqueo Cloudflare en texto plano
    if (htmlText.includes('Just a moment...') || htmlText.includes('Attention Required!')) {
      return res.status(200).json({
        success: false,
        message: 'Respuesta retenida por la verificación de Cloudflare.',
        count: 0,
        data: []
      });
    }

    // Extracción de ofertas usando regex sobre el código HTML
    const jobRegex = /<article[\s\S]*?<\/article>/g;
    const matches = htmlText.match(jobRegex) || [];

    const jobs = matches.map(articleHtml => {
      const titleMatch = articleHtml.match(/<a[^>]*href="(\/nx\/search\/jobs\/details\/~[^"]+)"[^>]*>(.*?)<\/a>/s) ||
                         articleHtml.match(/<a[^>]*href="(\/jobs\/~[^"]+)"[^>]*>(.*?)<\/a>/s);

      const rawLink = titleMatch ? titleMatch[1] : null;
      const rawTitle = titleMatch ? titleMatch[2].replace(/<[^>]+>/g, '').trim() : null;

      const descMatch = articleHtml.match(/<p[^>]*>(.*?)<\/p>/s) || articleHtml.match(/data-test="JobDescription"[^>]*>(.*?)<\/div>/s);
      let description = descMatch ? descMatch[1].replace(/<[^>]+>/g, ' ').trim() : '';

      return {
        title: rawTitle,
        link: rawLink ? `https://www.upwork.com${rawLink}` : null,
        description: description.substring(0, 180) + (description.length > 180 ? '...' : '')
      };
    }).filter(job => job.title && job.link);

    return res.status(200).json({
      success: true,
      query: keyword,
      count: jobs.length,
      data: jobs
    });

  } catch (error) {
    console.error('Error durante la ejecución del scraping:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
