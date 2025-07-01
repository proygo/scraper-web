// @ts-nocheck
import { NextRequest } from 'next/server';
import puppeteer from 'puppeteer';
import * as XLSX from 'xlsx';

export async function POST(req: NextRequest) {
  const { tournament } = await req.json();

  if (!tournament) {
    return new Response(JSON.stringify({ error: 'Missing tournament name' }), {
      status: 400,
    });
  }

  try {
    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ['--start-maximized'],
    });

    const [page] = await browser.pages();
    await page.goto('https://www.trackwrestling.com/', { waitUntil: 'load' });

    console.log('🧭 Please manually navigate to the bracket viewer.');
    console.log('⏳ Waiting up to 60 seconds for bracket popup...');

    let bracketPage = null;

    const popupPromise = new Promise<void>((resolve) => {
      browser.on('targetcreated', async (target) => {
        if (target.type() === 'page') {
          const newPage = await target.page();
          const url = newPage?.url() || '';
          if (url.includes('BracketViewer.jsp')) {
            console.log('✅ Detected bracket popup:', url);
            bracketPage = newPage;
            resolve();
          }
        }
      });
    });

    await Promise.race([
      popupPromise,
      new Promise((resolve) => setTimeout(resolve, 60000)),
    ]);

    if (!bracketPage) {
      console.log('⚠️ No popup detected. Using current tab instead...');
      bracketPage = page;

      console.log('🕹️ Please manually navigate to the bracket view (with the weight dropdown).');
      console.log('⏳ You have 45 seconds to do this...');
      await new Promise((resolve) => setTimeout(resolve, 45000));
    }

    await bracketPage.bringToFront();

    console.log('🔍 Scanning all frames for #weightBox...');
    bracketPage.frames().forEach((f, i) => {
      console.log(`  Frame ${i}: ${f.url()}`);
    });

    let frameWithDropdown = null;
    for (const frame of bracketPage.frames()) {
      try {
        const dropdown = await frame.$('#weightBox');
        if (dropdown) {
          console.log('✅ Found #weightBox in frame:', frame.url());
          frameWithDropdown = frame;
          break;
        }
      } catch (err) {
        // skip inaccessible frames
      }
    }

    if (!frameWithDropdown) {
      await browser.close();
      return new Response(JSON.stringify({ error: '#weightBox not found in any frame' }), {
        status: 500,
      });
    }

    await frameWithDropdown.waitForSelector('#weightBox', { timeout: 10000 });

    const weights = await frameWithDropdown.$$eval('#weightBox option', (opts) =>
      opts
        .filter((opt) => opt.value !== '')
        .map((opt) => ({
          value: opt.value,
          label: opt.label,
        }))
    );

    const allWrestlers = [];

    for (const weight of weights) {
      console.log(`🔄 Scraping weight: ${weight.label}`);
      await frameWithDropdown.select('#weightBox', weight.value);
      await new Promise((r) => setTimeout(r, 1500));

      const wrestlers = await frameWithDropdown.evaluate(() => {
        const entries = [];
        const cells = document.querySelectorAll('.bracket-cell, .full-line');

        for (let i = 0; i < cells.length; i++) {
          const text = cells[i].innerText?.trim?.() || '';
          const lines = text
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

          if (lines.length >= 2) {
            const nameLine = lines[0];
            const detailLine = lines[1];

            const seedMatch = nameLine.match(/,\s*(\d+(st|nd|rd|th))$/i);
            const seed = seedMatch ? seedMatch[1] : null;
            const cleanedName = nameLine.replace(/,\s*\d+(st|nd|rd|th)$/i, '');

            const detailParts = detailLine.split(',');
            const school = detailParts[0] ? detailParts[0].trim() : '';
            const gradeStr = detailParts[detailParts.length - 1]?.trim() || '';
            const grade = parseInt(gradeStr);

            let place = null;
            if (lines.length >= 3) {
              for (let j = 0; j < lines.length; j++) {
                if (/\b(1st|2nd|3rd|4th|5th|6th|7th|8th)\b/.test(lines[j])) {
                  place = lines[j];
                  break;
                }
              }
            }

            entries.push({
              name: cleanedName,
              grade: isNaN(grade) ? null : grade,
              school,
              seed,
              place,
            });
          } else if (text.length > 0) {
            entries.push({
              name: text,
              grade: null,
              school: '',
              seed: null,
              place: null,
            });
          }
        }

        return entries;
      });

      wrestlers.forEach((w) => {
        w.weight = parseInt(weight.label);
        w.tournament = tournament;
      });

      allWrestlers.push(...wrestlers);
    }

    allWrestlers.sort((a, b) => {
      const weightDiff = a.weight - b.weight;
      if (weightDiff !== 0) return weightDiff;

      const gradeDiff = (a.grade || 0) - (b.grade || 0);
      if (gradeDiff !== 0) return gradeDiff;

      return a.school.localeCompare(b.school);
    });

    const worksheet = XLSX.utils.json_to_sheet(allWrestlers);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Wrestlers');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    await browser.close();

    return new Response(buffer, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=wrestlers_${tournament}.xlsx`,
      },
    });
  } catch (err: any) {
    console.error('❌ Scraper failed:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
    });
  }
}
