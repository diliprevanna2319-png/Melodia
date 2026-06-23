// sources.js — free, keyless music sources: Internet Radio + Internet Archive.
// No API keys, no backend. All endpoints are free and support CORS.

const Sources = (() => {

  // ---- small fetch helper with timeout ----
  async function getJSON(url, { timeout = 12000 } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  // ================= INTERNET RADIO (radio-browser.info) =================
  // Several public mirrors; we try them in order until one answers.
  const RADIO_MIRRORS = [
    'https://de1.api.radio-browser.info',
    'https://nl1.api.radio-browser.info',
    'https://at1.api.radio-browser.info',
    'https://fi1.api.radio-browser.info'
  ];

  async function radio(path) {
    let lastErr;
    for (const base of RADIO_MIRRORS) {
      try { return await getJSON(base + path); }
      catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('All radio mirrors unreachable');
  }

  function mapStation(s) {
    return {
      type: 'radio',
      id: s.stationuuid,
      title: s.name?.trim() || 'Unknown station',
      sub: [s.country, (s.tags || '').split(',')[0], s.bitrate ? s.bitrate + 'kbps' : '']
              .filter(Boolean).join(' · '),
      art: s.favicon || '',
      url: s.url_resolved || s.url,
      tags: s.tags || ''
    };
  }

  const Radio = {
    async top(limit = 30) {
      const data = await radio(`/json/stations/topclick/${limit}`);
      return data.map(mapStation);
    },
    async byTag(tag, limit = 40) {
      const data = await radio(`/json/stations/search?tagList=${encodeURIComponent(tag)}&hidebroken=true&order=clickcount&reverse=true&limit=${limit}`);
      return data.map(mapStation);
    },
    async search(name, limit = 40) {
      const data = await radio(`/json/stations/search?name=${encodeURIComponent(name)}&hidebroken=true&order=clickcount&reverse=true&limit=${limit}`);
      return data.map(mapStation);
    }
  };

  // ================= INTERNET ARCHIVE (archive.org) =================
  const Archive = {
    async search(query, rows = 30) {
      const q = `mediatype:(audio) AND (${query})`;
      const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}` +
        `&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=year` +
        `&sort[]=downloads+desc&rows=${rows}&page=1&output=json`;
      const data = await getJSON(url);
      return (data.response?.docs || []).map(d => ({
        type: 'album',
        id: d.identifier,
        title: d.title || d.identifier,
        sub: [Array.isArray(d.creator) ? d.creator[0] : d.creator, d.year].filter(Boolean).join(' · ') || 'Internet Archive',
        art: `https://archive.org/services/img/${d.identifier}`
      }));
    },
    // Resolve an album/item into playable mp3 tracks.
    async tracks(identifier) {
      const data = await getJSON(`https://archive.org/metadata/${encodeURIComponent(identifier)}`);
      const files = data.files || [];
      const audio = files.filter(f =>
        /\.(mp3|ogg|m4a)$/i.test(f.name) &&
        /(VBR MP3|MP3|Ogg|MPEG-4 Audio|128Kbps MP3|64Kbps MP3)/i.test(f.format || '')
      );
      // de-dupe by track title, prefer first occurrence
      const seen = new Set();
      const tracks = [];
      for (const f of audio) {
        const key = (f.title || f.name).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        tracks.push({
          type: 'track',
          id: identifier + '/' + f.name,
          title: f.title || f.name.replace(/\.[^.]+$/, ''),
          sub: data.metadata?.creator || identifier,
          art: `https://archive.org/services/img/${identifier}`,
          url: `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(f.name)}`
        });
      }
      return tracks;
    }
  };

  return { Radio, Archive };
})();
