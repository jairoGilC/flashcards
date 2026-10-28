import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import initSqlJs, { type SqlJsStatic } from 'sql.js'
import { DeckFileError } from '../core/deckFile'
import { firstImage, mapNotes, parseApkg, stripHtml } from './apkg'

function readText(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsText(b)
  })
}

describe('stripHtml', () => {
  it('removes tags, sound refs and decodes entities', () => {
    expect(stripHtml('<b>食べる</b>&nbsp;[sound:taberu.mp3]')).toBe('食べる')
    expect(stripHtml('a &amp; b &lt;c&gt; &#x3042;&#12354;')).toBe('a & b <c> ああ')
  })

  it('keeps out-of-range character references as text instead of throwing', () => {
    expect(stripHtml('a &#99999999; b &#x110000;')).toBe('a &#99999999; b &#x110000;')
  })

  it('turns line breaks into spaces and collapses whitespace', () => {
    expect(stripHtml('<div>uno</div><div>dos</div>uno<br/>dos')).toBe('uno dos uno dos')
  })

  it('drops Anki furigana readings so brackets are not taken as the marked word', () => {
    expect(stripHtml('毎朝 食[た]べます')).toBe('毎朝食べます')
  })
})

describe('firstImage', () => {
  it('returns the decoded src of the first img', () => {
    expect(firstImage('x <img class="a" src="onigiri%20rice.jpg"> <img src="b.png">')).toBe('onigiri rice.jpg')
    expect(firstImage("<IMG SRC='a&amp;b.png'>")).toBe('a&b.png')
    expect(firstImage('no image')).toBeUndefined()
  })
})

describe('mapNotes', () => {
  it('maps first/second fields, tags and hint images', () => {
    const cards = mapNotes([
      { id: 1, guid: 'g1', flds: '食べる<img src="tabe.jpg">\x1fcomer\x1fextra', tags: ' n5 verbo ' },
      { id: 2, guid: 'g2', flds: '話す\x1fhablar<img src="voice.mp3">', tags: '' },
      { id: 3, guid: 'g3', flds: '<img src="only.png">\x1fsolo imagen', tags: '' },
    ])
    expect(cards).toEqual([
      { id: 'g1', question: '食べる', answer: 'comer', image: 'tabe.jpg', tags: ['n5', 'verbo'] },
      { id: 'g2', question: '話す', answer: 'hablar' },
    ])
  })
})

async function buildApkg(SQL: SqlJsStatic, opts: { file?: string; withImage?: boolean; did?: number; guid?: string } = {}): Promise<Blob> {
  const db = new SQL.Database()
  db.run('CREATE TABLE col (id integer primary key, decks text not null)')
  db.run('CREATE TABLE notes (id integer primary key, guid text not null, mid integer, tags text not null, flds text not null)')
  db.run('CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null)')
  const decks = {
    '1': { id: 1, name: 'Default' },
    '1700000000000': { id: 1700000000000, name: 'Japonés::Verbos' },
  }
  db.run('INSERT INTO col VALUES (1, ?)', [JSON.stringify(decks)])
  db.run('INSERT INTO notes VALUES (10, ?, 1, ?, ?)', [opts.guid ?? 'abc/1', ' n5 ', '食べる<img src="tabe.jpg">\x1fcomer'])
  db.run('INSERT INTO notes VALUES (11, ?, 1, ?, ?)', ['def+2', '', '話す\x1fhablar'])
  // Basic + reverse: two cards for note 10; it must become a single card.
  const did = opts.did ?? 1700000000000
  db.run('INSERT INTO cards VALUES (100, 10, ?, 0), (101, 10, ?, 1), (102, 11, ?, 0)', [did, did, did])
  const zip = new JSZip()
  zip.file(opts.file ?? 'collection.anki2', db.export())
  zip.file('media', JSON.stringify(opts.withImage === false ? {} : { '0': 'tabe.jpg', '1': 'unused.mp3' }))
  if (opts.withImage !== false) zip.file('0', 'JPGDATA')
  zip.file('1', 'MP3')
  db.close()
  return zip.generateAsync({ type: 'blob' })
}

describe('parseApkg', () => {
  it('reads a legacy .apkg into a deck file with media', async () => {
    const SQL = await initSqlJs()
    const { deck, media } = await parseApkg(await buildApkg(SQL), SQL)
    expect(deck).toEqual({
      version: 1,
      id: 'apkg-1700000000000',
      name: 'Japonés::Verbos',
      cards: [
        { id: 'abc/1', question: '食べる', answer: 'comer', image: 'tabe.jpg', tags: ['n5'] },
        { id: 'def+2', question: '話す', answer: 'hablar' },
      ],
    })
    expect([...media.keys()]).toEqual(['tabe.jpg'])
    expect(media.get('tabe.jpg')!.type).toBe('image/jpeg')
    expect(await readText(media.get('tabe.jpg')!)).toBe('JPGDATA')
  })

  it('prefers collection.anki21 when present', async () => {
    const SQL = await initSqlJs()
    const { deck } = await parseApkg(await buildApkg(SQL, { file: 'collection.anki21' }), SQL)
    expect(deck.cards).toHaveLength(2)
  })

  it('reads the deck name from the decks table of newer collections', async () => {
    const SQL = await initSqlJs()
    const db = new SQL.Database()
    db.run('CREATE TABLE col (id integer primary key, decks text)')
    db.run('CREATE TABLE decks (id integer primary key, name text)')
    db.run('CREATE TABLE notes (id integer primary key, guid text, tags text, flds text)')
    db.run('CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer)')
    db.run("INSERT INTO col VALUES (1, '{}')")
    db.run('INSERT INTO decks VALUES (5, ?)', ['Japonés\x1fKanji'])
    db.run("INSERT INTO notes VALUES (1, 'g', '', ?)", ['山\x1fmontaña'])
    db.run('INSERT INTO cards VALUES (1, 1, 5, 0)')
    const zip = new JSZip()
    zip.file('collection.anki21', db.export())
    const { deck } = await parseApkg(await zip.generateAsync({ type: 'blob' }), SQL)
    expect(deck.id).toBe('apkg-5')
    expect(deck.name).toBe('Japonés::Kanji')
  })

  it('drops image references whose file is missing', async () => {
    const SQL = await initSqlJs()
    const { deck, media } = await parseApkg(await buildApkg(SQL, { withImage: false }), SQL)
    expect(deck.cards[0].image).toBeUndefined()
    expect(media.size).toBe(0)
  })

  it('explains how to re-export when only the new anki21b format is present', async () => {
    const zip = new JSZip()
    zip.file('collection.anki21b', 'zstd')
    zip.file('collection.anki2', 'dummy')
    const err = await parseApkg(await zip.generateAsync({ type: 'blob' }), await initSqlJs()).catch((e) => e)
    expect(err).toBeInstanceOf(DeckFileError)
    expect(err.message).toMatch(/Support older Anki versions/)
  })

  it('gives unrelated decks from Anki\'s shared "Default" deck different ids', async () => {
    const SQL = await initSqlJs()
    const a = await parseApkg(await buildApkg(SQL, { did: 1, guid: 'first-a' }), SQL)
    const b = await parseApkg(await buildApkg(SQL, { did: 1, guid: 'first-b' }), SQL)
    const again = await parseApkg(await buildApkg(SQL, { did: 1, guid: 'first-a' }), SQL)
    expect(a.deck.id).not.toBe(b.deck.id)
    expect(again.deck.id).toBe(a.deck.id)
  })

  it('leaves the rating unset so a re-import keeps the user\'s choice', async () => {
    const SQL = await initSqlJs()
    const { deck } = await parseApkg(await buildApkg(SQL), SQL)
    expect(deck.rating).toBeUndefined()
  })

  it('rejects files that are not zips', async () => {
    await expect(parseApkg(new Blob(['nope']), await initSqlJs())).rejects.toBeInstanceOf(DeckFileError)
  })
})
