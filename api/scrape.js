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
    // 1. Conectarse a Browserless con parámetros para bloquear imágenes/estilos en el servidor de Browserless
    const browserWSEndpoint = `wss://production-sfo.browserless.io?token=${BROWSERLESS_TOKEN}&--no-sandbox=true&--disable-setuid-sandbox=true&--block-resources=image,stylesheet,font,media`;
    
    browser = await puppeteer.connect({ browserWSEndpoint });

    const page = await browser.newPage();

    // 2. Ocultar huellas de automatización
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    // 3. Usar 'domcontentloaded' en lugar de 'networkidle2' para no esperar a que todos los trackers carguen
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });

    // 4. Esperar específicamente a los contenedores de los empleos (máximo 4 segundos)
    const jobSelector = 'section[data-ev-label="search_results_impression"] article, article.job-tile, article';
    await page.waitForSelector(jobSelector, { timeout: 4000 }).catch(() => null);

    // 5. Extracción de datos
    const jobs = await page.evaluate(() => {
      const articles = Array.from(document.querySelectorAll('article'));
      return articles.map(art => {
        const titleEl = art.querySelector('h2 a, h3 a, a[data-test="UpLink"]');
        const title = titleEl ? titleEl.innerText.trim() : 'Sin título';
        const link = titleEl ? titleEl.href : null;

        const jobTypeEl = art.querySelector('[data-test="job-type"], [data-test="JobTileHeader"]');
        const jobType = jobTypeEl ? jobTypeEl.innerText.replace(/\n/g, ' ').trim() : 'No especificado';

        const descriptionEl = art.querySelector('[data-test="JobDescription"], .job-description, p');
        const description = descriptionEl ? descriptionEl.innerText.trim() : '';

        const postedTimeEl = art.querySelector('[data-test="posted-on"], small, span.text-muted');
        const postedTime = postedTimeEl ? postedTimeEl.innerText.trim() : '';

        return {
          title,
          link,
          jobType,
          postedTime,
          description: description.substring(0, 180) + (description.length > 180 ? '...' : '')
        };
      }).filter(job => job.link !== null);
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
