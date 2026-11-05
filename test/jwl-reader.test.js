const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { DatabaseSync } = require('node:sqlite');
const { readPlaylists, extractUserDb } = require('../jwl-reader');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'jwl-test-'));

function makeUserDb(dir) {
  const p = path.join(dir, 'userData.db');
  const db = new DatabaseSync(p);
  db.exec(`
    CREATE TABLE Tag(TagId INTEGER, Type INTEGER, Name TEXT);
    CREATE TABLE TagMap(TagMapId INTEGER, TagId INTEGER, PlaylistItemId INTEGER, Position INTEGER);
    CREATE TABLE PlaylistItem(PlaylistItemId INTEGER, Label TEXT, StartTrimOffsetTicks INTEGER, EndTrimOffsetTicks INTEGER, EndAction INTEGER);
    CREATE TABLE PlaylistItemIndependentMediaMap(PlaylistItemId INTEGER, IndependentMediaId INTEGER);
    CREATE TABLE IndependentMedia(IndependentMediaId INTEGER, FilePath TEXT, MimeType TEXT);
    CREATE TABLE PlaylistItemLocationMap(PlaylistItemId INTEGER, LocationId INTEGER);
    CREATE TABLE Location(LocationId INTEGER, Type INTEGER, KeySymbol TEXT, BookNumber INTEGER);
    INSERT INTO Tag VALUES (10,2,'Discurso'),(11,2,'Vazia'),(12,2,'  Outra  '),(13,1,'pedro');
    INSERT INTO PlaylistItem VALUES (1,'Mateus 4:4',0,0,0),(2,'Lembre-se da morte de Jesus',0,0,2),(3,'foto.JPG',10,0,2),(4,NULL,0,0,2);
    INSERT INTO Location VALUES (100,0,NULL,40),(101,3,'lmd',NULL);
    INSERT INTO PlaylistItemLocationMap VALUES (1,100),(2,101);
    INSERT INTO IndependentMedia VALUES (200,'x.JPG','image/jpeg');
    INSERT INTO PlaylistItemIndependentMediaMap VALUES (3,200);
    INSERT INTO TagMap VALUES (1,10,3,3),(2,10,1,1),(3,10,2,2),(4,12,4,1);
  `);
  db.close();
  return p;
}

function makeZip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, data] of Object.entries(entries)) {
    const n = Buffer.from(name), d = Buffer.from(data), crc = zlib.crc32(d);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(d.length, 18); lh.writeUInt32LE(d.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(d.length, 20); ch.writeUInt32LE(d.length, 24);
    ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, n, d); centrals.push(ch, n);
    offset += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

test('lê playlists com itens, em ordem, com tipos e regras', () => {
  const lists = readPlaylists(makeUserDb(tmp()));
  assert.deepEqual(lists.map(p => p.name), ['Discurso', 'Outra']);
  assert.deepEqual(lists[0].medias.map(m => m.type), ['bible', 'video', 'image']);
  assert.equal(lists[0].medias[0].title, 'Mateus 4:4 - "Continuar"');
  assert.equal(lists[0].medias[1].title, 'Lembre-se da morte de Jesus');
  assert.match(lists[0].medias[2].title, /"Editado"/);
  assert.deepEqual(lists[1].medias.map(m => [m.title, m.type]), [['Mídia 1', 'other']]);
  assert.ok(lists.every(p => p.medias.every(m => m.reference === '')));
});

test('banco sem as tabelas do JW Library é inválido', () => {
  const p = path.join(tmp(), 'x.db'); new DatabaseSync(p).exec('CREATE TABLE A(x)');
  assert.throws(() => readPlaylists(p), /Arquivo do JW Library inválido\./);
});

test('extractUserDb extrai só o userData.db; zip sem ele é inválido', async () => {
  const dir = tmp();
  const zip = path.join(dir, 'b.jwlibrary');
  fs.writeFileSync(zip, makeZip({ 'manifest.json': '{}', 'userData.db': fs.readFileSync(makeUserDb(tmp())), 'big.jpg': Buffer.alloc(1000) }));
  const out = await extractUserDb(zip, path.join(dir, 'out'));
  assert.equal(path.basename(out), 'userData.db');
  assert.deepEqual(fs.readdirSync(path.dirname(out)), ['userData.db']);
  const bad = path.join(dir, 'c.zip'); fs.writeFileSync(bad, makeZip({ 'a.txt': 'x' }));
  await assert.rejects(extractUserDb(bad, path.join(dir, 'out2')), /Arquivo do JW Library inválido\./);
  const notZip = path.join(dir, 'd.jwlibrary'); fs.writeFileSync(notZip, 'texto');
  await assert.rejects(extractUserDb(notZip, path.join(dir, 'out3')), /Arquivo do JW Library inválido\./);
});
