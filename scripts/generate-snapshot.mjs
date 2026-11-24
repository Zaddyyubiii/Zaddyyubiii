import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const USERNAME = process.env.GITHUB_USERNAME || 'Zaddyyubiii';
const TOKEN = process.env.GITHUB_TOKEN || '';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function formatDate(isoString, includeDay = true) {
  if (!isoString) return 'N/A';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'N/A';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  if (!includeDay) return `${month} ${year}`;
  const day = date.getUTCDate();
  return `${month} ${day}, ${year}`;
}

async function fetchGitHubJson(url) {
  const headers = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'Zaddyyubiii-Profile-Snapshot'
  };
  if (TOKEN) {
    headers.Authorization = `Bearer ${TOKEN}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API request failed (${response.status} ${response.statusText}) for ${url}: ${body}`);
  }
  return response.json();
}

function buildLanguageBreakdown(languageBytesMap) {
  const entries = Object.entries(languageBytesMap).sort((a, b) => b[1] - a[1]);
  const totalBytes = entries.reduce((sum, [, bytes]) => sum + bytes, 0);

  if (totalBytes === 0) {
    return [];
  }

  const top = entries.slice(0, 5).map(([name, bytes]) => ({
    name,
    bytes,
    percent: (bytes / totalBytes) * 100
  }));

  const otherBytes = entries.slice(5).reduce((sum, [, bytes]) => sum + bytes, 0);
  if (otherBytes > 0) {
    top.push({
      name: 'Other',
      bytes: otherBytes,
      percent: (otherBytes / totalBytes) * 100
    });
  }

  return top;
}

function renderSnapshotSvg({
  theme,
  publicRepos,
  languagesCount,
  latestPushLabel,
  languages,
  recentRepos,
  syncedDate
}) {
  const isDark = theme === 'dark';
  const palette = isDark
    ? {
        bg: '#161C2B',
        border: '#2F3C59',
        cardBg: '#1D2538',
        cardBorder: '#334263',
        divider: '#2F3C59',
        textPrimary: '#FAE2C6',
        textSecondary: '#C8D3EC',
        accentText: '#9BB3E8',
        tagBg: '#FAE2C6',
        tagText: '#161C2B',
        langTagBg: '#25304A',
        langTagText: '#FAE2C6',
        barTrack: '#25304A',
        shades: ['#FAE2C6', '#9BB3E8', '#657CAF', '#C4D3F2', '#C9AE90', '#586A8F']
      }
    : {
        bg: '#FAE2C6',
        border: '#D4B898',
        cardBg: '#FDF4E7',
        cardBorder: '#DFC7AB',
        divider: '#D4B898',
        textPrimary: '#44578C',
        textSecondary: '#4A5B82',
        accentText: '#44578C',
        tagBg: '#44578C',
        tagText: '#FAE2C6',
        langTagBg: '#EFE0CD',
        langTagText: '#44578C',
        barTrack: '#EAD1B5',
        shades: ['#44578C', '#657CAF', '#879CC7', '#A6B7D9', '#7D6A58', '#B8A28B']
      };

  const barWidth = 536;
  let currentBarX = 44;
  const barSegments = languages.map((lang, idx) => {
    const color = palette.shades[idx % palette.shades.length];
    const isLast = idx === languages.length - 1;
    const width = isLast ? Math.max(2, 44 + barWidth - currentBarX) : Math.max(4, (lang.percent / 100) * barWidth);
    const segment = `<rect x="${currentBarX.toFixed(1)}" y="152" width="${width.toFixed(1)}" height="10" fill="${color}" />`;
    currentBarX += width;
    return segment;
  });

  const legendItems = languages.map((lang, idx) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const x = 44 + col * 182;
    const y = 186 + row * 28;
    const color = palette.shades[idx % palette.shades.length];
    const label = `${truncate(lang.name, 18)} ${lang.percent.toFixed(1)}%`;
    return `
      <rect x="${x}" y="${y - 9}" width="9" height="9" rx="1.5" fill="${color}" />
      <text x="${x + 15}" y="${y}" class="sans" font-size="11.5" font-weight="400" fill="${palette.textSecondary}">${escapeXml(label)}</text>`;
  });

  const repoRows = recentRepos.map((repo, idx) => {
    const y = 66 + idx * 52;
    const repoName = escapeXml(truncate(repo.name, 34));
    const langLabel = escapeXml(truncate(repo.language || 'Docs', 16));
    const pushedLabel = escapeXml(formatDate(repo.pushed_at, true));

    return `
      <g class="row-${idx + 1}">
        <rect x="634" y="${y}" width="522" height="44" rx="6" fill="${palette.cardBg}" stroke="${palette.cardBorder}" />
        <rect x="634" y="${y + 8}" width="3" height="28" rx="1.5" fill="${palette.accentText}" class="accent-cycle-${idx + 1}" />
        <text x="652" y="${y + 26.5}" class="sans" font-size="13.5" font-weight="500" fill="${palette.textPrimary}">${repoName}</text>
        <rect x="944" y="${y + 11}" width="106" height="22" rx="3" fill="${palette.langTagBg}" />
        <text x="997" y="${y + 25.5}" class="sans" font-size="11" font-weight="500" fill="${palette.langTagText}" text-anchor="middle">${langLabel}</text>
        <text x="1140" y="${y + 26}" class="sans" font-size="11.5" font-weight="400" fill="${palette.textSecondary}" text-anchor="end">${pushedLabel}</text>
      </g>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 265" width="1200" height="265" role="img" aria-labelledby="snap-${theme}-title snap-${theme}-desc">
  <title id="snap-${theme}-title">Live GitHub Activity Snapshot for ${escapeXml(USERNAME)}</title>
  <desc id="snap-${theme}-desc">Auto-generated editorial summary of public repositories, programming languages, and recent repository updates.</desc>
  <defs>
    <clipPath id="snap-clip-${theme}">
      <rect x="0" y="0" width="1200" height="265" rx="14" />
    </clipPath>
    <clipPath id="bar-clip-${theme}">
      <rect x="44" y="152" width="${barWidth}" height="10" rx="5" />
    </clipPath>
    <linearGradient id="bar-sheen-${theme}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0" />
      <stop offset="50%" stop-color="#FFFFFF" stop-opacity="0.32" />
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0" />
    </linearGradient>
    <style>
      .serif {
        font-family: 'Instrument Serif', Georgia, 'Times New Roman', serif;
      }
      .sans {
        font-family: 'Outfit', 'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif;
      }
      @keyframes rowEnter {
        0% { opacity: 0.92; transform: translateX(6px); }
        100% { opacity: 1; transform: translateX(0); }
      }
      @keyframes barSheen {
        0% { transform: translateX(-140px); }
        100% { transform: translateX(680px); }
      }
      @keyframes cycleHighlight {
        0%, 26%, 100% { opacity: 0.18; }
        8%, 18% { opacity: 1; }
      }
      @keyframes syncCalm {
        0%, 100% { opacity: 0.45; }
        50% { opacity: 1; }
      }
      .row-1 { animation: rowEnter 0.55s cubic-bezier(0.16, 1, 0.3, 1) 0s both; }
      .row-2 { animation: rowEnter 0.55s cubic-bezier(0.16, 1, 0.3, 1) 0.08s both; }
      .row-3 { animation: rowEnter 0.55s cubic-bezier(0.16, 1, 0.3, 1) 0.16s both; }
      .bar-sheen { animation: barSheen 6.5s linear infinite; }
      .accent-cycle-1 { animation: cycleHighlight 9s ease-in-out 0s infinite; }
      .accent-cycle-2 { animation: cycleHighlight 9s ease-in-out 3s infinite; }
      .accent-cycle-3 { animation: cycleHighlight 9s ease-in-out 6s infinite; }
      .sync-dot { animation: syncCalm 3.6s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) {
        * {
          animation: none !important;
          opacity: 1 !important;
          transform: none !important;
        }
      }
    </style>
  </defs>

  <g clip-path="url(#snap-clip-${theme})">
    <rect x="0" y="0" width="1200" height="265" fill="${palette.bg}" />
    <rect x="0.5" y="0.5" width="1199" height="264" rx="14" fill="none" stroke="${palette.border}" />

    <!-- Left Panel: Metrics & Language Breakdown -->
    <rect x="44" y="28" width="184" height="24" rx="0" fill="${palette.tagBg}" />
    <text x="136" y="44" class="sans" font-size="11" font-weight="500" fill="${palette.tagText}" text-anchor="middle" letter-spacing="0.5">LIVE GITHUB SNAPSHOT</text>

    <!-- 3 Verified Real Metrics in Editorial Serif -->
    <text x="44" y="94" class="serif" font-size="30" font-weight="400" fill="${palette.textPrimary}">${escapeXml(publicRepos)}</text>
    <text x="44" y="113" class="sans" font-size="11.5" font-weight="400" fill="${palette.textSecondary}">Public Repositories</text>

    <line x1="196" y1="68" x2="196" y2="114" stroke="${palette.divider}" stroke-width="1" />
    <text x="216" y="94" class="serif" font-size="30" font-weight="400" fill="${palette.textPrimary}">${escapeXml(languagesCount)}</text>
    <text x="216" y="113" class="sans" font-size="11.5" font-weight="400" fill="${palette.textSecondary}">Languages Detected</text>

    <line x1="384" y1="68" x2="384" y2="114" stroke="${palette.divider}" stroke-width="1" />
    <text x="404" y="94" class="serif" font-size="30" font-weight="400" fill="${palette.accentText}">${escapeXml(latestPushLabel)}</text>
    <text x="404" y="113" class="sans" font-size="11.5" font-weight="400" fill="${palette.textSecondary}">Latest Push</text>

    <!-- Language Distribution Bar -->
    <text x="44" y="141" class="sans" font-size="10.5" font-weight="500" fill="${palette.textSecondary}" letter-spacing="0.5">PUBLIC REPOSITORY LANGUAGES</text>
    <rect x="44" y="152" width="${barWidth}" height="10" rx="5" fill="${palette.barTrack}" />
    <g clip-path="url(#bar-clip-${theme})">
      ${barSegments.join('\n      ')}
      <rect x="44" y="152" width="140" height="10" fill="url(#bar-sheen-${theme})" class="bar-sheen" />
    </g>

    <!-- Language Legend -->
    ${legendItems.join('')}

    <!-- Panel Divider -->
    <line x1="608" y1="28" x2="608" y2="236" stroke="${palette.divider}" stroke-width="1" />

    <!-- Right Panel: Recently Updated Repositories -->
    <text x="634" y="44" class="sans" font-size="11" font-weight="500" fill="${palette.textSecondary}" letter-spacing="0.5">RECENTLY UPDATED REPOSITORIES</text>
    ${repoRows.join('\n')}

    <text x="1142" y="242" class="sans" font-size="11" font-weight="400" fill="${palette.textSecondary}" text-anchor="end">Auto-synced via GitHub Actions · ${escapeXml(syncedDate)} UTC</text>
    <circle cx="1153" cy="238.5" r="3" fill="${palette.accentText}" class="sync-dot" />
  </g>
</svg>
`;
}

async function main() {
  const user = await fetchGitHubJson(`https://api.github.com/users/${USERNAME}`);
  const repos = await fetchGitHubJson(`https://api.github.com/users/${USERNAME}/repos?per_page=100&sort=updated`);

  const ownRepos = repos.filter((repo) => !repo.fork);
  const languageTotals = {};

  const languageResponses = await Promise.all(
    ownRepos.map((repo) => fetchGitHubJson(repo.languages_url))
  );

  for (const langMap of languageResponses) {
    for (const [language, bytes] of Object.entries(langMap)) {
      languageTotals[language] = (languageTotals[language] || 0) + bytes;
    }
  }

  const languages = buildLanguageBreakdown(languageTotals);
  const languagesCount = Object.keys(languageTotals).length;

  const sortedByPush = [...ownRepos]
    .filter((repo) => repo.name.toLowerCase() !== USERNAME.toLowerCase())
    .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at));

  const recentRepos = sortedByPush.slice(0, 3);
  const latestPushLabel = sortedByPush.length > 0 ? formatDate(sortedByPush[0].pushed_at, false) : 'N/A';
  const syncedDate = new Date().toISOString().slice(0, 10);

  const payload = {
    publicRepos: user.public_repos ?? ownRepos.length,
    languagesCount,
    latestPushLabel,
    languages,
    recentRepos,
    syncedDate
  };

  await mkdir(ASSETS_DIR, { recursive: true });
  await writeFile(path.join(ASSETS_DIR, 'github-snapshot-dark.svg'), renderSnapshotSvg({ theme: 'dark', ...payload }), 'utf8');
  await writeFile(path.join(ASSETS_DIR, 'github-snapshot-light.svg'), renderSnapshotSvg({ theme: 'light', ...payload }), 'utf8');

  console.log(`Generated GitHub snapshot SVGs for ${USERNAME} (${payload.publicRepos} repos, ${languagesCount} languages, synced ${syncedDate} UTC).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
