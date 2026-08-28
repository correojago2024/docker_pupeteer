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
    // Solo bloqueamos imágenes y medios para acelerar, pero dejamos pasar CSS/JS para que React renderice los trabajos
    const browserWSEndpoint = `wss://production-sfo.browserless.io?token=${BROWSERLESS_TOKEN}&--block-resources=image,media`;
    
    browser = await puppeteer.connect({ browserWSEndpoint });

    const page = await browser.newPage();

    // 1. Emular una resolución y User-Agent real
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    // 2. Navegar esperando la carga inicial
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });

    // 3. Esperar específicamente a que aparezca cualquier contenedor de trabajo en el DOM
    const selectorsToWait = [
      'article',
      '[data-test="job-tile-list"]',
      'section[data-ev-label="search_results_impression"]'
    ];
    
    await Promise.race(
      selectorsToWait.map(selector => page.waitForSelector(selector, { timeout: 6000 }))
    ).catch(() => null);

    // Un pequeño delay adicional para que termine el pintado de componentes
    await new Promise(resolve => setTimeout(resolve, 1500));

    // 4. Extracción flexibilizada de datos
    const jobs = await page.evaluate(() => {
      // Buscar elementos tipo article o con data-test de empleo
      const cards = Array.from(
        document.querySelectorAll('article, [data-test="job-tile-list"] > div, section article')
      );

      return cards.map(card => {
        // Enlace y Título
        const linkEl = card.querySelector('a[href*="/jobs/"], h2 a, h3 a, [data-test="UpLink"]');
        const title = linkEl ? linkEl.innerText.trim() : null;
        const link = linkEl ? linkEl.href : null;

        // Presupuesto / Tipo de Trabajo
        const typeEl = card.querySelector('[data-test="job-type"], [data-test="JobTileHeader"], ul.list-inline');
        const jobType = typeEl ? typeEl.innerText.replace(/\n/g, ' ').trim() : 'No especificado';

        // Descripción
        const descEl = card.querySelector('[data-test="JobDescription"], .job-description, p');
        const description = descEl ? descEl.innerText.trim() : '';

        // Tiempo de publicación
        const timeEl = card.querySelector('[data-test="posted-on"], small, span.text-muted');
        const postedTime = timeEl ? timeEl.innerText.trim() : '';

        return {
          title,
          link,
          jobType,
          postedTime,
          description: description.substring(0, 180) + (description.length > 180 ? '...' : '')
        };
      }).filter(job => job.title && job.link); // Filtrar solo los que realmente tengan título y enlace
    });

    await browser.disconnect();

    return res.status(200).json({ 
      success: true, 
      query: keyword,
      count: jobs.length, 
      data: jobs 
    });

  } catch (error) {
    if (browser) await browser.disconnect();
    console.error('Error en scraping:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
