/**
 * EventosAPP - Leitor de arquivos do JW Library (.jwlplaylist / .jwlibrary)
 * Extrai o userData.db do zip e lê as playlists (Tag Type 2) com seus itens.
 */
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { playlistMediaTitle } = require('./playlist-title');

const INVALID = 'Arquivo do JW Library inválido.';
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'heic', 'avif'];
const VIDEO_EXTS = ['mp4', 'm4v', 'mov', 'avi', 'mkv', 'webm', 'mpeg', 'mpg', '3gp', 'ts'];
const BIBLE_REGEX = /^(?:[1-3]\s+)?(?:[A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)?)\s+\d+[:.]\d+(?:\s*[-,]\s*\d+)*$/i;
const REQUIRED_TABLES = ['Tag', 'TagMap', 'PlaylistItem', 'PlaylistItemIndependentMediaMap',
  'IndependentMedia', 'PlaylistItemLocationMap', 'Location'];
const LOCATION_TYPE_VIDEO = 3;

const ITEMS_SQL = `
  SELECT pi.PlaylistItemId AS id, pi.Label, pi.StartTrimOffsetTicks, pi.EndTrimOffsetTicks, pi.EndAction,
         im.FilePath AS mediaPath, loc.Type AS locationType
  FROM TagMap tm
  JOIN PlaylistItem pi ON pi.PlaylistItemId = tm.PlaylistItemId
  LEFT JOIN PlaylistItemIndependentMediaMap pim ON pim.PlaylistItemId = pi.PlaylistItemId
  LEFT JOIN IndependentMedia im ON im.IndependentMediaId = pim.IndependentMediaId
  LEFT JOIN PlaylistItemLocationMap plm ON plm.PlaylistItemId = pi.PlaylistItemId
  LEFT JOIN Location loc ON loc.LocationId = plm.LocationId
  WHERE tm.TagId = ?
  ORDER BY tm.Position, pi.PlaylistItemId`;

function classify(row, label) {
  if (row.mediaPath) {
    const ext = path.extname(row.mediaPath).toLowerCase().replace('.', '');
    if (IMAGE_EXTS.includes(ext)) return 'image';
    if (VIDEO_EXTS.includes(ext)) return 'video';
  }
  if (Number(row.locationType) === LOCATION_TYPE_VIDEO) return 'video';
  if (BIBLE_REGEX.test(label)) return 'bible';
  return 'other';
}

function readPlaylists(dbPath) {
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const have = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));
    if (!REQUIRED_TABLES.every(t => have.has(t))) throw new Error(INVALID);

    const tags = db.prepare('SELECT TagId, Name FROM Tag WHERE Type = 2 ORDER BY TagId').all();
    const itemsStmt = db.prepare(ITEMS_SQL);
    const playlists = [];
    for (const tag of tags) {
      const seen = new Set();
      const medias = [];
      for (const row of itemsStmt.all(tag.TagId)) {
        if (seen.has(row.id)) continue; // várias linhas de join = um item
        seen.add(row.id);
        const label = (row.Label || '').trim();
        const baseName = label
          || (row.mediaPath ? path.basename(row.mediaPath, path.extname(row.mediaPath)) : 'Mídia ' + (medias.length + 1));
        medias.push({ title: playlistMediaTitle(baseName, row), type: classify(row, label), reference: '' });
      }
      if (medias.length) playlists.push({ name: String(tag.Name || '').trim(), medias });
    }
    return playlists;
  } catch (e) {
    throw new Error(INVALID);
  } finally {
    try { if (db) db.close(); } catch (_) {}
  }
}

async function extractUserDb(zipPath, destDir) {
  try {
    const unzipper = require('unzipper');
    const dir = await unzipper.Open.file(zipPath);
    const entry = dir.files.find(f => f.type === 'File' && f.path === 'userData.db');
    if (!entry) throw new Error(INVALID);
    await fs.promises.mkdir(destDir, { recursive: true });
    const out = path.join(destDir, 'userData.db');
    await fs.promises.writeFile(out, await entry.buffer());
    return out;
  } catch (e) {
    throw new Error(INVALID);
  }
}

module.exports = { readPlaylists, extractUserDb, INVALID };
