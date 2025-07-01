'use client';

import { useState } from 'react';

export default function Home() {
  const [tournament, setTournament] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleScrape = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournament, url }),
      });

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || 'Scrape failed');
      }

      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `wrestlers_${tournament}.xlsx`;
      link.click();
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    }

    setLoading(false);
  };

  return (
    <main className="max-w-xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-4">TrackWrestling Recruit Scraper</h1>
      <input
        className="w-full border p-2 mb-2"
        placeholder="Tournament Name"
        value={tournament}
        onChange={(e) => setTournament(e.target.value)}
      />
      
 
      <button
        onClick={handleScrape}
        className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
        disabled={loading}
      >
        {loading ? 'Scraping...' : 'Download Excel'}
      </button>
      {error && <p className="text-red-600 mt-4">{error}</p>}
    </main>
  );
}
