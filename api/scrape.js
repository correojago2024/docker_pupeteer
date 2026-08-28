module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const keyword = req.query.q || 'wordpress';
  const sort = req.query.sort || 'recency';

  const SCRAPE_DO_TOKEN = process.env.SCRAPE_DO_TOKEN || '3c2162fa0c8d46029d7a655532558984fad63d065db';

  // URL objetivo de la búsqueda en la web de Upwork
  const targetUrl = `https://www.upwork.com/nx/search/jobs/?q=${encodeURIComponent(keyword)}&sort=${sort}`;

  // Usamos render=true para ejecutar JS y super=true para proxies residenciales
  const scrapeDoUrl = `https://api.scrape.do/?token=${SCRAPE_DO_TOKEN}&url=${encodeURIComponent(targetUrl)}&render=true&super=true`;

  try {
    const response = await fetch(scrapeDoUrl);

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: `Scrape.do devolvió estado HTTP ${response.status}`
      });
    }

    const htmlText = await response.text();

    // Si la respuesta aún muestra el reto de Cloudflare
    if (htmlText.includes('Just a moment...') || htmlText.includes('Attention Required!')) {
      return res.status(200).json({
        success: false,
        message: 'Cloudflare bloqueó la Petición. Intenta nuevamente.',
        pageTitle: 'Just a moment...'
      });
    }

    // Extraer enlaces e información de ofertas de trabajo desde el HTML renderizado
    // Extraemos los bloques de anuncios mediante expresiones regulares básicas
    const jobRegex = /<article[\s\S]*?<\/article>/g;
    const matches = htmlText.match(jobRegex) || [];

    const jobs = matches.map(articleHtml => {
      // Extraer enlace y título
      const titleMatch = articleHtml.match(/<a[^>]*href="(\/nx\/search\/jobs\/details\/~[^"]+)"[^>]*>(.*?)<\/a>/s) ||
                         articleHtml.match(/<a[^>]*href="(\/jobs\/~[^"]+)"[^>]*>(.*?)<\/a>/s);

      const rawLink = titleMatch ? titleMatch[1] : null;
      const rawTitle = titleMatch ? titleMatch[2].replace(/<[^>]+>/g, '').trim() : null;

      // Extraer descripción limpia
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
      provider: 'Scrape.do (Render + SuperProxy)',
      count: jobs.length,
      data: jobs
    });

  } catch (error) {
    console.error('Error al ejecutar scraping:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
