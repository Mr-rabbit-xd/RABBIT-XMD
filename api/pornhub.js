import express from 'express';
import fetch from 'node-fetch';
import cheerio from 'cheerio';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/api/pornhubsearch', async (req, res) => {
  const query = req.query.query;
  if (!query) return res.status(400).json({ status: false, message: 'Missing ?query=' });

  try {
    const searchUrl = `https://www.pornhub.com/video/search?search=${encodeURIComponent(query)}`;
    const html = await fetch(searchUrl).then(r => r.text());
    const $ = cheerio.load(html);

    const results = [];
    const items = $('li.videoBox');

    for (let i = 0; i < items.length && results.length < 5; i++) {
      const el = items[i];
      const link = 'https://www.pornhub.com' + $(el).find('a').attr('href');
      const title = $(el).find('span.title').text().trim();
      const duration = $(el).find('var.duration').text().trim();
      const views = $(el).find('.views').text().trim();
      const thumbnail = $(el).find('img').attr('data-thumb_url') || $(el).find('img').attr('src');

      // Fetch video page to get direct download link
      const page = await fetch(link).then(r => r.text());
      const start = page.indexOf('flashvars') + 11;
      const jsonRaw = page.slice(start, page.indexOf('};', start) + 1);
      let download = null;

      try {
        const json = JSON.parse(jsonRaw);
        const mp4 = (json.mediaDefinitions || []).find(x => x.format === 'mp4' && x.quality === '720');
        download = mp4?.videoUrl || json.video_url || null;
      } catch (e) {
        download = null;
      }

      results.push({ title, duration, views, thumbnail, link, download });
    }

    return res.json({ status: true, code: 200, result: results });

  } catch (err) {
    return res.status(500).json({ status: false, error: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('✅ Pornhub Search API is running.');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
