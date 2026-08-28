const fetch = require('node-fetch'); // O puedes usar globalThis.fetch disponible en Node 18+

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

  try {
    // Petición HTTP a la API /unblock de Browserless para saltarse Cloudflare
    const response = await fetch(`https://production-sfo.browserless.io/unblock?token=${BROWSERLESS_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: targetUrl,
        content: true, // Solicita el HTML ya renderizado post-Cloudflare
        cookies: true,
        javascript: true
      })
    });

    const data = await response.json();

    // Si Cloudflare bloqueó la respuesta en la API
    if (data.statusCode === 403 || (data.html && data.html.includes('Just a moment...'))) {
      return res.status(200).json({
        success: false,
        message: 'Bloqueado por Cloudflare. Se requiere un Proxy Residencial.',
        pageTitle: 'Just a moment...'
      });
    }

    // Extraer datos usando expresiones regulares / procesamiento del HTML retornado
    const html = data.html || '';
    
    // Si la respuesta contiene HTML válido de Upwork, procedemos a responder
    return res.status(200).json({
      success: true,
      query: keyword,
      message: 'Acceso concedido por Browserless Unblock',
      rawLength: html.length
    });

  } catch (error) {
    console.error('Error en /unblock:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
