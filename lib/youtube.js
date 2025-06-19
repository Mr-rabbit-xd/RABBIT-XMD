const axios = require("axios");
const cheerio = require("cheerio");
const { AP, getJson } = require('../plugins/pluginsCore');

const YOUTUBE_DOMAINS = new Set([
  'gaming.youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube.com'
]);

const YT_REGEX = /^https?:\/\/(youtu\.be\/|(www\.)?youtube\.com\/(embed|v|shorts)\/)/;

function extractVideoId(url) {
  const parsedUrl = new URL(url.trim());
  let videoId = parsedUrl.searchParams.get('v');

  if (YT_REGEX.test(url.toLowerCase()) && !videoId) {
    const pathParts = parsedUrl.pathname.split('/');
    videoId = parsedUrl.hostname === 'youtu.be' ? pathParts[1] : pathParts[2];
  } else {
    if (parsedUrl.hostname && !YOUTUBE_DOMAINS.has(parsedUrl.hostname))
      throw Error("Not a YouTube domain");
  }

  if (!videoId)
    throw Error("No video id found: \"" + url + "\"");

  return videoId.substring(0, 11);
}

async function YtInfo(url) {
  try {
    const videoId = extractVideoId(url);
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await axios.get(oembedUrl);
    const data = response.data;
    return {
      title: data.title,
      thumbnail: data.thumbnail_url,
      author: data.author_name,
      videoId: videoId
    };
  } catch (e) {
    return false;
  }
}

async function yts(query) {
  try {
    const res = await axios.get('https://m.youtube.com/results?search_query=' + encodeURIComponent(query), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36'
      }
    });

    const $ = cheerio.load(res.data);
    let ytData;

    $("script").each((_, el) => {
      const scriptText = $(el).html();
      if (scriptText && scriptText.includes("var ytInitialData =")) {
        const json = scriptText.replace(/^var ytInitialData = /, '').replace(/;$/, '');
        ytData = JSON.parse(json);
      }
    });

    if (!ytData) throw new Error("Failed to parse YouTube data.");

    const results = [];
    const sections = ytData.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
    const items = sections[0]?.itemSectionRenderer?.contents || [];

    items.forEach(item => {
      const type = Object.keys(item)[0];
      const data = item[type];

      if (type === 'videoRenderer') {
        results.push({
          title: data.title?.runs[0]?.text,
          videoId: data.videoId,
          url: 'https://youtu.be/' + data.videoId,
          image: data.thumbnail?.thumbnails?.slice().pop()?.url,
          thumbnail: data.thumbnail?.thumbnails?.pop()?.url,
          duration: data.lengthText?.simpleText,
          views: data.viewCountText?.simpleText,
          publishedTime: data.publishedTimeText?.simpleText,
          author: data.ownerText?.runs[0]?.text
        });
      }
    });

    return results;
  } catch (err) {
    console.error('Error in ytsearch:', err);
    return [];
  }
}

async function ytv(url) {
  try {
    const res = await getJson('https://api-aswin-sparky.koyeb.app/api/downloader/ytv?url=' + url);
    return res.data.downloadURL;
  } catch (err) {
    console.error('Error fetching audio:', err);
    throw err;
  }
}

async function yta(url) {
  try {
    const res = await getJson('https://api-aswin-sparky.koyeb.app/api/downloader/song?search=' + url);
    return res.data.downloadURL;
  } catch (err) {
    console.error('Error fetching audio:', err);
    throw err;
  }
}

async function spdl(url) {
  try {
    const res = await getJson('https://api-aswin-sparky.koyeb.app/api/downloader/spotify?url=' + url);
    return res.data.download;
  } catch (err) {
    console.error('Error fetching audio:', err);
    throw err;
  }
}

module.exports = {
  YtInfo,
  yts,
  ytv,
  yta,
  spdl
};
