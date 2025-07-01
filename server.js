const express = require('express');
const scrapeBracket = require('./scraper');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/scrape', async (req, res) => {
  const { tournamentUrl, tournamentName } = req.body;

  try {
    const file = await scrapeBracket(tournamentUrl, tournamentName);
    const filePath = path.resolve(__dirname, file);
    res.download(filePath);
  } catch (err) {
    console.error('❌ Scraper failed:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Backend listening at http://localhost:${PORT}`);
});
