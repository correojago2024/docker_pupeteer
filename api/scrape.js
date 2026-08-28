const puppeteer = require('puppeteer-core');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const keyword = req.query.q || 'wordpress';
  const sort = req.query.sort || 'recency';
  const targetUrl = `https://www.upwork.com/nx/search/jobs/?q=${encodeURIComponent(keyword)}&sort=${sort}`;
  
  const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN;

  if (!BROWSERLESS_TOKEN) {
    return res.status(500).json({ 
      success: false, 
      error: 'Falta la variable BROWSERLESS_TOKEN en Vercel' 
    });
  }

  let browser;
  try {
    // 1. IMPORTANTE: Usamos la ruta /stealth de Browserless con bypass de Cloudflare
    const browserWSEndpoint = `wss://production-sfo.browserless.io/stealth?token=${BROWSERLESS_TOKEN}&--block-resources=image,media`;
    
    browser = await puppeteer.connect({ browserWSEndpoint });

    const page = await browser.newPage();

    // 2. Cabeceras HTTP reales para imitar un navegador humano
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });

    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    // 3. Navegar a Upwork
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });

    // Esperar a que cargue el contenido o el posible bloqueo
    await new Promise(resolve => setTimeout(resolve, 2500));

    // Obtener el título de la página para verificar si fue bloqueado por Cloudflare
    const pageTitle = await page.title();

    // 4. Extraer empleos desde el DOM
    const jobs = await page.evaluate(() => {
      // Buscar elementos tipo article o contenedores de trabajos de Upwork
      const elements = Array.from(document.querySelectorAll('article, [data-test="job-tile-list"] > div'));

      return elements.map(el => {
        const linkEl = el.querySelector('a[href*="/jobs/"], h2 a, h3 a');
        const title = linkEl ? linkEl.innerText.trim() : null;
        const link = linkEl ? linkEl.href : null;

        const typeEl = el.querySelector('[data-test="job-type"], [data-test="JobTileHeader"]');
        const jobType = typeEl ? typeEl.innerText.replace(/\n/g, ' ').trim() : '';

        const descEl = el.querySelector('[data-test="JobDescription"], p');
        const description = descEl ? descEl.innerText.trim() : '';

        const timeEl = el.querySelector('[data-test="posted-on"], small');
        const postedTime = timeEl ? timeEl.innerText.trim() : '';

        return {
          title,
          link,
          jobType,
          postedTime,
          description: description.substring(0, 150) + (description.length > 150 ? '...' : '')
        };
      }).filter(job => job.title && job.link);
    });

    await browser.disconnect();

    // Si no encontró nada, devolvemos el título de la página devuelta para diagnosticar
    return res.status(200).json({ 
      success: true, 
      query: keyword,
      pageTitle: pageTitle, // Nos dirá si apareció "Attention Required! | Cloudflare" o similar
      count: jobs.length, 
      data: jobs 
    });

  } catch (error) {
    if (browser) await browser.disconnect();
    console.error('Error en scraping:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
