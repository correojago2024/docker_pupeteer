const puppeteer = require('puppeteer-core');

module.exports = async (req, res) => {
  // Configurar cabeceras de CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  // Parámetros de búsqueda (ejemplo: /api/scrape?q=react&sort=recency)
  const keyword = req.query.q || 'nodejs';
  const sort = req.query.sort || 'recency'; // 'recency' para ver los más nuevos
  
  // URL de búsqueda de Upwork
  const targetUrl = `https://www.upwork.com/nx/search/jobs/?q=${encodeURIComponent(keyword)}&sort=${sort}`;
  
  const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN;

  if (!BROWSERLESS_TOKEN) {
    return res.status(500).json({ 
      success: false, 
      error: 'Falta la variable de entorno BROWSERLESS_TOKEN en Vercel' 
    });
  }

  let browser;
  try {
    // Conexión remota al navegador mediante Browserless.io
    browser = await puppeteer.connect({
      browserWSEndpoint: `wss://production-sfo.browserless.io?token=${BROWSERLESS_TOKEN}`
    });

    const page = await browser.newPage();

    // 1. Ocultar huellas de automatización e imitar una pantalla de laptop normal
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    // 2. Navegar a Upwork esperando a que la red se estabilice
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // 3. Esperar a que carguen los elementos de las tarjetas de trabajo
    const jobSelector = 'section[data-ev-label="search_results_impression"] article, article.job-tile';
    await page.waitForSelector(jobSelector, { timeout: 12000 }).catch(() => null);

    // 4. Extraer los datos directamente del DOM cargado en la página
    const jobs = await page.evaluate(() => {
      // Buscar todos los artículos/tarjetas de empleo
      const articles = Array.from(document.querySelectorAll('article'));

      return articles.map(art => {
        // Extraer Título y Enlace
        const titleEl = art.querySelector('h2 a, h3 a, a[data-test="UpLink"]');
        const title = titleEl ? titleEl.innerText.trim() : 'Sin título';
        const link = titleEl ? titleEl.href : null;

        // Extraer Tipo de Pago (Tarifa por hora o Precio fijo / Presupuesto)
        const jobTypeEl = art.querySelector('[data-test="job-type"], [data-test="JobTileHeader"]');
        const jobType = jobTypeEl ? jobTypeEl.innerText.replace(/\n/g, ' ').trim() : 'No especificado';

        // Extraer Descripción breve / Snippet
        const descriptionEl = art.querySelector('[data-test="JobDescription"], .job-description, p');
        const description = descriptionEl ? descriptionEl.innerText.trim() : '';

        // Extraer la antigüedad del post (ej. "Posted 10 minutes ago")
        const postedTimeEl = art.querySelector('[data-test="posted-on"], small, span.text-muted');
        const postedTime = postedTimeEl ? postedTimeEl.innerText.trim() : '';

        // Extraer Nivel de experiencia requerido (Entry, Intermediate, Expert)
        const expLevelEl = art.querySelector('[data-test="experience-level"]');
        const experienceLevel = expLevelEl ? expLevelEl.innerText.trim() : '';

        return {
          title,
          link,
          jobType,
          postedTime,
          experienceLevel,
          description: description.substring(0, 200) + (description.length > 200 ? '...' : '')
        };
      }).filter(job => job.link !== null); // Descartar contenedores vacíos
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
    console.error('Error al realizar el scraping en Upwork:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
