// 用語クイズ：用語と用語辞典から、4択の問題をその場で作る（説明は事実確認ずみの用語の文をそのまま使う）
const norm = (t) => String(t || '').normalize('NFKC').toLowerCase().replace(/[（(].*?[）)]/g, '').replace(/\s+/g, '')
const bigrams = (t) => { const s = norm(t); const out = new Set(); for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2)); return out }
function similar(a, b) {
  const A = bigrams(a), B = bigrams(b)
  if (!A.size || !B.size) return 0
  let n = 0
  for (const x of A) if (B.has(x)) n++
  return n / Math.min(A.size, B.size)
}
const shuffle = (arr, rng) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
// 説明の中の用語そのものを伏せる（答えが見えてしまわないように）
export function maskTerm(text, term) {
  let out = String(text || '')
  const names = [term, String(term).replace(/[（(].*?[）)]/g, '').trim(), ...((String(term).match(/[（(](.*?)[）)]/) || [])[1] || '').split(/[、,，・]/)].map((x) => x.trim()).filter((x) => x.length >= 2)
  for (const n of names.sort((a, b) => b.length - a.length)) out = out.split(n).join('〇〇')
  return out
}
// 選択肢にしてよい用語か（答えと紛らわしいもの・中身が重なるものは外す）
function okDistractor(t, x) {
  if (t.id === x.id) return false
  const nt = norm(t.term), nx = norm(x.term)
  if (!nx || nt === nx || nt.includes(nx) || nx.includes(nt)) return false
  if (norm(t.meaning).includes(nx) || norm(x.meaning).includes(nt)) return false
  if (similar(t.meaning, x.meaning) > 0.45) return false
  return true
}
function pickDistractors(t, pool, rng, n = 3) {
  // 同じ分野の用語を優先する（分野のない基本の用語どうしも、同じ分野とみなす）
  const same = shuffle(pool.filter((x) => (x.cat || '') === (t.cat || '') && !!x.dict === !!t.dict && okDistractor(t, x)), rng)
  const near = shuffle(pool.filter((x) => (x.cat || '') === (t.cat || '') && !!x.dict !== !!t.dict && okDistractor(t, x)), rng)
  const other = shuffle(pool.filter((x) => (x.cat || '') !== (t.cat || '') && okDistractor(t, x)), rng)
  const out = []
  for (const x of [...same, ...near, ...other]) {
    if (out.length >= n) break
    if (out.every((y) => okDistractor(y, x))) out.push(x)
  }
  return out
}
// targets：出題する用語、pool：選択肢に使う用語（同じ資格の全部）
export function makeTermQuiz(targets, pool, rng = Math.random) {
  const qs = []
  for (const t of targets) {
    const ds = pickDistractors(t, pool, rng)
    if (ds.length < 3) continue
    const toTerm = rng() < 0.6
    const opts = shuffle([t, ...ds], rng)
    const answer = [opts.indexOf(t)]
    if (toTerm) {
      qs.push({ id: t.id, kind: 'meaning2term', stem: `次の説明にあてはまる用語はどれか。\n${maskTerm(t.meaning, t.term)}`, choices: opts.map((x) => x.term), answer, term: t })
    } else {
      qs.push({ id: t.id, kind: 'term2meaning', stem: `「${t.term}」の説明として、正しいものはどれか。`, choices: opts.map((x) => maskTerm(x.meaning, x.term)), answer, term: t })
    }
  }
  return qs
}
