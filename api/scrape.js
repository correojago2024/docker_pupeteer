
const puppeteer = require('puppeteer-core');

module.exports = async (req, res) => {
  // Configurar CORS para permitir peticiones desde cualquier origen
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const keyword = req.query.q || 'nodejs';
  const targetUrl = `https://www.upwork.com/nx/search/jobs/?q=${encodeURIComponent(keyword)}`;
  
  // Obtener el Token de las variables de entorno
  const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN;

  if (!BROWSERLESS_TOKEN) {
    return res.status(500).json({ 
      success: false, 
      error: 'Falta la variable de entorno BROWSERLESS_TOKEN en Vercel' 
    });
  }

  let browser;
  try {
    // Conectarse remotamente a Browserless.io mediante WebSocket
    browser = await puppeteer.connect({
      browserWSEndpoint: `wss://production-sfo.browserless.io?token=${BROWSERLESS_TOKEN}`
    });

    const page = await browser.newPage();

    // Configurar User-Agent estándar
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );

    // Navegar a la página de Upwork
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Esperar a que carguen los contenedores de los empleos
    await page.waitForSelector('article', { timeout: 10000 }).catch(() => null);

    // Extraer datos
    const jobs = await page.evaluate(() => {
      const articles = Array.from(document.querySelectorAll('article'));
      return articles.map(art => {
        const titleEl = art.querySelector('h2 a') || art.querySelector('h3 a');
        return {
          title: titleEl ? titleEl.innerText.trim() : null,
          link: titleEl ? titleEl.href : null,
          snippet: art.innerText.substring(0, 150).replace(/\n/g, ' ')
        };
      });
    });

    // Desconectar el navegador
    await browser.disconnect();

    return res.status(200).json({ success: true, count: jobs.length, data: jobs });

  } catch (error) {
    if (browser) await browser.disconnect();
    console.error('Error en scraping:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
