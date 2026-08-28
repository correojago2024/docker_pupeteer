module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const keyword = req.query.q || 'wordpress';
  const ZENROWS_API_KEY = process.env.ZENROWS_API_KEY || 'c4999b5a9058783a516abbd706a7930de8a4f761';

  // URL objetivo en Upwork
  const targetUrl = `https://www.upwork.com/nx/search/jobs/?q=${encodeURIComponent(keyword)}&sort=recency`;

  // Construcción de la URL de ZenRows
  // antibot=true y premium_proxy=true evitan los bloqueos de Cloudflare rápidamente sin exceder los 10s de Vercel.
  const zenrowsUrl = `https://api.zenrows.com/v1/?apikey=${ZENROWS_API_KEY}&url=${encodeURIComponent(targetUrl)}&antibot=true&premium_proxy=true`;

  try {
    const response = await fetch(zenrowsUrl);

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: `ZenRows devolvió el estado HTTP ${response.status}`
      });
    }

    const htmlText = await response.text();

    // Detección de página de bloqueo
    if (htmlText.includes('Just a moment...') || htmlText.includes('Attention Required!')) {
      return res.status(200).json({
        success: false,
        message: 'La petición fue interceptada por el anti-bot de Cloudflare.',
        count: 0,
        data: []
      });
    }

    // Extracción de etiquetas de la respuesta HTML
    const jobRegex = /<article[\s\S]*?<\/article>/g;
    const matches = htmlText.match(jobRegex) || [];

    const jobs = matches.map(articleHtml => {
      const titleMatch = articleHtml.match(/<a[^>]*href="(\/nx\/search\/jobs\/details\/~[^"]+)"[^>]*>(.*?)<\/a>/s) ||
                         articleHtml.match(/<a[^>]*href="(\/jobs\/~[^"]+)"[^>]*>(.*?)<\/a>/s);

      const rawLink = titleMatch ? titleMatch[1] : null;
      const rawTitle = titleMatch ? titleMatch[2].replace(/<[^>]+>/g, '').trim() : null;

      const descMatch = articleHtml.match(/<p[^>]*>(.*?)<\/p>/s) || 
                        articleHtml.match(/data-test="JobDescription"[^>]*>(.*?)<\/div>/s);
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
    console.error('Error durante la ejecución con ZenRows:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
