const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ message: 'Servicio de Scraping de Upwork activo. Usa /scrape?q=tu_busqueda' });
});

app.get('/scrape', async (req, res) => {
  const keyword = req.query.q || 'nodejs';
  const targetUrl = `https://www.upwork.com/nx/search/jobs/?q=${encodeURIComponent(keyword)}`;

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    });

    const page = await browser.newPage();

    // Bloquear recursos pesados para acelerar la carga y ahorrar memoria en Render
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Configurar User-Agent estándar
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );

    // Navegar
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // Esperar resultados
    await page.waitForSelector('article', { timeout: 15000 }).catch(() => null);

    // Extraer títulos y enlaces
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

    await browser.close();
    return res.json({ success: true, count: jobs.length, data: jobs });

  } catch (error) {
    if (browser) await browser.close();
    console.error('Error scraping Upwork:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor de scraping escuchando en el puerto ${PORT}`);
});
