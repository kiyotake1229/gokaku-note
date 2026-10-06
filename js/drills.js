// 計算ドリル：数字を変えて何度でも出せる計算問題（答えはプログラムで計算するので、問題ごとの誤りが出ない）
// 各ドリルは rng（0〜1の乱数を返す関数）を受け取り、{ stem, choices, answer, explanation } を返す

const ri = (rng, a, b) => a + Math.floor(rng() * (b - a + 1))
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)]
const comma = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const round = (x, d = 4) => Math.round(x * 10 ** d) / 10 ** d
const dec = (x, d = 4) => { const s = round(x, d).toFixed(d); return s.replace(/0+$/, '').replace(/\.$/, '') }
const bin8 = (n) => { const b = n.toString(2).padStart(8, '0'); return b.slice(0, 4) + ' ' + b.slice(4) }
const sup = (n) => String(n).split('').map((d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]).join('')

// 正解と、まちがえ方から作った選択肢を、重ならない4つにして並べかえる
function choicesOf(rng, correct, wrongs, fill) {
  const set = [String(correct)]
  // 負の数や計算できない値は、選択肢にしない
  const okv = (s) => !/^-|NaN|Infinity|undefined/.test(s)
  for (const w of wrongs) { const s = String(w); if (okv(s) && !set.includes(s)) set.push(s); if (set.length === 4) break }
  let guard = 0
  while (set.length < 4 && fill && guard++ < 50) { const s = String(fill()); if (okv(s) && !set.includes(s)) set.push(s) }
  const order = set.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
  const choices = order.map((i) => set[i])
  return { choices, answer: [order.indexOf(0)] }
}

const D = {}

// ---- 2進数・16進数 ----
D.bin2dec = {
  name: '2進数 → 10進数', cat: '基礎理論', desc: '8けたの2進数を10進数に',
  gen(rng) {
    const n = ri(rng, 17, 254)
    const k1 = ri(rng, 0, 7); let k2 = ri(rng, 0, 7); if (k2 === k1) k2 = (k1 + 3) % 8
    const rev = parseInt(n.toString(2).padStart(8, '0').split('').reverse().join(''), 2)
    const bits = n.toString(2).padStart(8, '0').split('').map(Number)
    const terms = bits.map((b, i) => `${b}×${2 ** (7 - i)}`).join(' ＋ ')
    return {
      stem: `2進数の ${bin8(n)} を、10進数で表したものはどれか。`,
      ...choicesOf(rng, n, [n ^ (1 << k1), rev, n ^ (1 << k2)], () => n + ri(rng, -9, 9)),
      explanation: `2進数は、右のけたから 1，2，4，8，16，32，64，128 の重みをもちます。${terms} ＝ **${n}** です。`,
    }
  },
}
D.dec2bin = {
  name: '10進数 → 2進数', cat: '基礎理論', desc: '10進数を8けたの2進数に',
  gen(rng) {
    const n = ri(rng, 17, 254)
    const k1 = ri(rng, 0, 7); let k2 = ri(rng, 0, 7); if (k2 === k1) k2 = (k1 + 5) % 8
    const rev = parseInt(n.toString(2).padStart(8, '0').split('').reverse().join(''), 2)
    const parts = []
    let r = n
    for (let w = 128; w >= 1; w /= 2) if (r >= w) { parts.push(w); r -= w }
    return {
      stem: `10進数の ${n} を、8けたの2進数で表したものはどれか。`,
      ...choicesOf(rng, bin8(n), [bin8(n ^ (1 << k1)), bin8(rev), bin8(n ^ (1 << k2))], () => bin8((n + ri(rng, 1, 30)) % 256)),
      explanation: `${n} ＝ ${parts.join(' ＋ ')} と、2のべき乗（128，64，32，16，8，4，2，1）の和に分けます。使った重みのけたを1、使わないけたを0にすると **${bin8(n)}** です。`,
    }
  },
}
D.hex = {
  name: '2進数 → 16進数', cat: '基礎理論', desc: '4けたずつ区切って16進数に',
  gen(rng) {
    const n = ri(rng, 26, 254)
    const h = n.toString(16).toUpperCase().padStart(2, '0')
    const hi = n >> 4, lo = n & 15
    const swap = (lo.toString(16) + hi.toString(16)).toUpperCase()
    const near1 = ((hi + 1) % 16).toString(16).toUpperCase() + lo.toString(16).toUpperCase()
    const near2 = hi.toString(16).toUpperCase() + ((lo + 15) % 16).toString(16).toUpperCase()
    return {
      stem: `2進数の ${bin8(n)} を、16進数で表したものはどれか。`,
      ...choicesOf(rng, h, [swap, near1, near2, String(n)], () => ri(rng, 16, 255).toString(16).toUpperCase()),
      explanation: `2進数を右から4けたずつ区切り、それぞれを16進数の1けたにします。${bin8(n).split(' ')[0]} ＝ ${hi}（16進数で ${hi.toString(16).toUpperCase()}）、${bin8(n).split(' ')[1]} ＝ ${lo}（16進数で ${lo.toString(16).toUpperCase()}）なので、**${h}** です。10〜15 は A〜F で表します。`,
    }
  },
}
D.bits = {
  name: '必要なビット数', cat: '基礎理論', desc: '何種類を区別するのに何ビットいるか',
  gen(rng) {
    let N = ri(rng, 20, 1500)
    let b = Math.ceil(Math.log2(N))
    if (2 ** b === N) N += 1, b += 1
    return {
      stem: `${comma(N)} 種類のものを、それぞれ異なるビットの並びで区別したい。必要な最小のビット数はどれか。`,
      ...choicesOf(rng, `${b}ビット`, [`${b - 1}ビット`, `${b + 1}ビット`, `${Math.ceil(Math.log10(N + 1))}ビット`, `${b + 2}ビット`]),
      explanation: `nビットで表せるのは 2ⁿ 通りです。2${sup(b - 1)} ＝ ${comma(2 ** (b - 1))} 通りでは ${comma(N)} 種類に足りず、2${sup(b)} ＝ ${comma(2 ** b)} 通りなら足りるので、**${b}ビット**です。`,
    }
  },
}

// ---- 稼働率 ----
const AV = [0.8, 0.85, 0.9, 0.95, 0.98, 0.99]
D.avail = {
  name: '稼働率（直列・並列）', cat: 'システムの信頼性', desc: '装置をつないだシステム全体の稼働率',
  gen(rng) {
    const a = pick(rng, AV), b = pick(rng, AV), c = pick(rng, AV)
    const kind = pick(rng, ['series', 'parallel', 'mixed'])
    const ser = a * b, par = 1 - (1 - a) * (1 - b), mix = par * c
    if (kind === 'series') {
      return {
        stem: `稼働率 ${a} の装置Aと、稼働率 ${b} の装置Bを直列につないだシステムがある（AとBの両方が動いているときだけ、システムが動く）。システム全体の稼働率はどれか。`,
        ...choicesOf(rng, dec(ser), [dec(par), dec((a + b) / 2), dec(1 - (1 - a) - (1 - b) + 0.02)], () => dec(ser + ri(rng, 1, 9) / 100)),
        explanation: `直列は「両方が動いている」ときだけ動くので、稼働率をかけ算します。${a} × ${b} ＝ **${dec(ser)}** です。直列にすると、1台のときより稼働率は下がります。`,
      }
    }
    if (kind === 'parallel') {
      return {
        stem: `稼働率 ${a} の装置Aと、稼働率 ${b} の装置Bを並列につないだシステムがある（AとBのどちらか一方でも動いていれば、システムが動く）。システム全体の稼働率はどれか。`,
        ...choicesOf(rng, dec(par), [dec(ser), dec((a + b) / 2), dec(Math.min(1, a + b) === 1 ? 1 - (1 - a) * (1 - b) / 2 : a + b)], () => dec(Math.max(0, par - ri(rng, 1, 9) / 100))),
        explanation: `並列は「両方とも止まっている」ときだけ止まります。両方が止まる確率は (1 − ${a}) × (1 − ${b}) ＝ ${dec((1 - a) * (1 - b))} なので、稼働率は 1 − ${dec((1 - a) * (1 - b))} ＝ **${dec(par)}** です。`,
      }
    }
    return {
      stem: `稼働率 ${a} の装置Aと稼働率 ${b} の装置Bを並列につなぎ、その全体に、稼働率 ${c} の装置Cを直列につないだシステムがある。システム全体の稼働率はどれか。`,
      ...choicesOf(rng, dec(mix), [dec(a * b * c), dec(par), dec(1 - (1 - a * b) * (1 - c))], () => dec(Math.max(0, mix - ri(rng, 1, 9) / 100))),
      explanation: `まず並列の部分：1 − (1 − ${a}) × (1 − ${b}) ＝ ${dec(par)}。これと装置Cは直列なので、かけ算して ${dec(par)} × ${c} ＝ **${dec(mix)}** です。`,
    }
  },
}
const MT = [[480, 20], [720, 80], [990, 10], [450, 50], [190, 10], [380, 20], [960, 40], [240, 60], [294, 6], [570, 30], [180, 20], [1980, 20]]
D.mtbf = {
  name: '稼働率（MTBF・MTTR）', cat: 'システムの信頼性', desc: '平均故障間隔と平均修復時間から',
  gen(rng) {
    const [f, r] = pick(rng, MT)
    const A = f / (f + r)
    return {
      stem: `ある装置の MTBF（平均故障間隔：故障せずに動いている時間の平均）は ${f} 時間、MTTR（平均修復時間）は ${r} 時間である。この装置の稼働率はどれか。`,
      ...choicesOf(rng, dec(A, 3), [dec(r / (f + r), 3), dec((f - r) / f, 3), dec(f / (f + 2 * r), 3)], () => dec(Math.max(0, A - ri(rng, 1, 5) / 100), 3)),
      explanation: `稼働率 ＝ MTBF ÷（MTBF ＋ MTTR）です。${f} ÷（${f} ＋ ${r}）＝ ${f} ÷ ${f + r} ＝ **${dec(A, 3)}** です。MTTR ÷（MTBF ＋ MTTR）は、止まっている割合（${dec(r / (f + r), 3)}）です。`,
    }
  },
}

// ---- お金の計算 ----
const BE = [[300, 0.4], [200, 0.6], [300, 0.75], [100, 0.8], [400, 0.5], [600, 0.4], [150, 0.7], [240, 0.6], [360, 0.4], [500, 0.75]]
D.breakeven = {
  name: '損益分岐点', cat: '会計', desc: '利益がちょうど0になる売上高',
  gen(rng) {
    const [F, r] = pick(rng, BE)
    const S = pick(rng, [1000, 1200, 1500, 2000])
    const V = Math.round(S * r)
    const bep = Math.round(F / (1 - r))
    const withProfit = rng() < 0.4
    if (withProfit) {
      const P = pick(rng, [100, 200, 300])
      const need = Math.round((F + P) / (1 - r))
      return {
        stem: `売上高 ${comma(S)} 万円、変動費 ${comma(V)} 万円、固定費 ${comma(F)} 万円の会社がある。変動費率（変動費 ÷ 売上高）が変わらないとき、利益を ${P} 万円にするために必要な売上高は何万円か。`,
        ...choicesOf(rng, `${comma(need)}万円`, [`${comma(bep)}万円`, `${comma(Math.round((F + P) / r))}万円`, `${comma(F + P + V)}万円`], () => `${comma(need + ri(rng, 1, 9) * 50)}万円`),
        explanation: `変動費率は ${V} ÷ ${S} ＝ ${r} です。必要な売上高 ＝（固定費 ＋ 目標の利益）÷（1 − 変動費率）＝（${F} ＋ ${P}）÷（1 − ${r}）＝ **${comma(need)}万円** です。`,
      }
    }
    return {
      stem: `売上高 ${comma(S)} 万円、変動費 ${comma(V)} 万円、固定費 ${comma(F)} 万円の会社がある。損益分岐点売上高は何万円か。`,
      ...choicesOf(rng, `${comma(bep)}万円`, [`${comma(Math.round(F / r))}万円`, `${comma(F + V)}万円`, `${comma(S - V - F)}万円`], () => `${comma(bep + ri(rng, 1, 9) * 50)}万円`),
      explanation: `変動費率 ＝ 変動費 ÷ 売上高 ＝ ${V} ÷ ${S} ＝ ${r} です。損益分岐点売上高 ＝ 固定費 ÷（1 − 変動費率）＝ ${F} ÷（1 − ${r}）＝ **${comma(bep)}万円** です。この売上高のとき、利益がちょうど0になります。`,
    }
  },
}
D.profit = {
  name: '売上総利益・営業利益', cat: '会計', desc: '損益計算書の利益',
  gen(rng) {
    const S = ri(rng, 20, 90) * 100, C = Math.round(S * pick(rng, [0.5, 0.55, 0.6, 0.65, 0.7]) / 10) * 10
    const G = Math.round(S * pick(rng, [0.1, 0.15, 0.2]) / 10) * 10, NonOp = pick(rng, [30, 50, 80])
    const gross = S - C, op = gross - G
    const askOp = rng() < 0.6
    if (askOp) {
      return {
        stem: `ある会社の1年間の数字は、売上高 ${comma(S)} 万円、売上原価 ${comma(C)} 万円、販売費及び一般管理費 ${comma(G)} 万円、営業外費用 ${NonOp} 万円である。営業利益は何万円か。`,
        ...choicesOf(rng, `${comma(op)}万円`, [`${comma(gross)}万円`, `${comma(op - NonOp)}万円`, `${comma(S - G)}万円`], () => `${comma(op + ri(rng, 1, 9) * 10)}万円`),
        explanation: `売上総利益 ＝ 売上高 − 売上原価 ＝ ${comma(S)} − ${comma(C)} ＝ ${comma(gross)}万円。営業利益 ＝ 売上総利益 − 販売費及び一般管理費 ＝ ${comma(gross)} − ${comma(G)} ＝ **${comma(op)}万円** です。営業外費用は、営業利益のあとの経常利益を求めるときに引きます。`,
      }
    }
    return {
      stem: `ある会社の1年間の数字は、売上高 ${comma(S)} 万円、売上原価 ${comma(C)} 万円、販売費及び一般管理費 ${comma(G)} 万円である。売上総利益は何万円か。`,
      ...choicesOf(rng, `${comma(gross)}万円`, [`${comma(op)}万円`, `${comma(C)}万円`, `${comma(S - G)}万円`], () => `${comma(gross + ri(rng, 1, 9) * 10)}万円`),
      explanation: `売上総利益（粗利）＝ 売上高 − 売上原価 ＝ ${comma(S)} − ${comma(C)} ＝ **${comma(gross)}万円** です。ここから販売費及び一般管理費を引いたもの（${comma(op)}万円）が営業利益です。`,
    }
  },
}
D.roi = {
  name: 'ROI（投資利益率）', cat: '会計', desc: '投資に対して、どれだけ利益が出たか',
  gen(rng) {
    const I = pick(rng, [200, 300, 400, 500, 800, 1000])
    const pct = pick(rng, [10, 15, 20, 25, 30, 40, 50])
    const P = I * pct / 100
    return {
      stem: `ROI ＝ 投資によって得られた利益 ÷ 投資額 × 100（％）とする。${comma(I)} 万円のシステム投資によって、1年間で ${comma(P)} 万円の利益が得られた。この1年間の ROI は何％か。`,
      ...choicesOf(rng, `${pct}％`, [`${Math.round(I / P * 100)}％`, `${100 - pct}％`, `${pct * 2}％`, `${100 + pct}％`]),
      explanation: `ROI ＝ ${comma(P)} ÷ ${comma(I)} × 100 ＝ **${pct}％** です。ROI が大きいほど、少ない投資で多くの利益が出たことを表します。`,
    }
  },
}

// ---- データ量と転送時間 ----
D.image = {
  name: '画像のデータ量', cat: 'マルチメディア', desc: '画素数 × 色の情報量',
  gen(rng) {
    const [w, h] = pick(rng, [[1000, 800], [1600, 1200], [2000, 1500], [1200, 1000], [800, 600], [3000, 2000]])
    const bits = pick(rng, [8, 24])
    const bytes = w * h * bits / 8
    const MB = bytes / 1e6
    const fmt = (x) => `${dec(x, 2)}Mバイト`
    return {
      stem: `横 ${comma(w)} 画素、縦 ${comma(h)} 画素の画像を、1画素あたり ${bits} ビットの色の情報で保存する。圧縮しないときのデータ量は何Mバイトか。ここで、1Mバイト ＝ 10${sup(6)} バイトとする。`,
      ...choicesOf(rng, fmt(MB), [fmt(MB * 8), fmt(w * h / 1e6), fmt(MB / 8)], () => fmt(MB * pick(rng, [2, 3, 0.5]))),
      explanation: `画素数は ${comma(w)} × ${comma(h)} ＝ ${comma(w * h)} 画素。1画素 ${bits} ビット ＝ ${bits / 8} バイトなので、${comma(w * h)} × ${bits / 8} ＝ ${comma(bytes)} バイト ＝ **${fmt(MB)}** です。ビットとバイト（8ビット ＝ 1バイト）の取り違えに注意します。`,
    }
  },
}
const TR = [[100, 20, 0.8], [50, 10, 0.8], [150, 100, 0.6], [300, 50, 0.8], [600, 100, 0.8], [100, 10, 0.5], [45, 6, 0.6], [200, 40, 0.5], [75, 15, 0.5], [250, 100, 0.5]]
D.transfer = {
  name: 'データの転送時間', cat: 'ネットワーク', desc: 'ファイルを送るのにかかる時間',
  gen(rng) {
    const [mb, mbps, e] = pick(rng, TR)
    const t = mb * 8 / (mbps * e)
    const f = (x) => `${dec(x, 2)}秒`
    return {
      stem: `${mb}Mバイトのファイルを、通信速度 ${mbps}Mビット/秒の回線で送る。回線の伝送効率（実際にデータを送るのに使える割合）が ${e * 100}％のとき、転送にかかる時間は何秒か。`,
      ...choicesOf(rng, f(t), [f(mb / (mbps * e)), f(mb * 8 / mbps), f(mb * 8 * e / mbps)], () => f(t * pick(rng, [2, 0.5, 1.5]))),
      explanation: `ファイルの大きさをビットにすると ${mb} × 8 ＝ ${mb * 8}Mビット。実際に使える速度は ${mbps} × ${e} ＝ ${round(mbps * e, 2)}Mビット/秒です。${mb * 8} ÷ ${round(mbps * e, 2)} ＝ **${f(t)}** です。バイト → ビットの変換（×8）を忘れないようにします。`,
    }
  },
}

// ---- アローダイアグラム（最短の所要日数） ----
D.critical = {
  name: '最短の所要日数', cat: 'プロジェクトマネジメント', desc: '作業の順番と日数から、全体の日数',
  gen(rng) {
    const d = { A: ri(rng, 2, 6), B: ri(rng, 2, 8), C: ri(rng, 2, 8), D: ri(rng, 2, 7), E: ri(rng, 2, 7), F: ri(rng, 1, 5) }
    const paths = [['A', 'B', 'D', 'F'], ['A', 'C', 'E', 'F'], ['A', 'C', 'D', 'F']]
    const tot = paths.map((p) => p.reduce((a, k) => a + d[k], 0))
    const best = Math.max(...tot)
    const sum = Object.values(d).reduce((a, x) => a + x, 0)
    const table = ['| 作業 | 日数 | 先に終わっている必要がある作業 |', `| A | ${d.A} | なし |`, `| B | ${d.B} | A |`, `| C | ${d.C} | A |`, `| D | ${d.D} | B，C |`, `| E | ${d.E} | C |`, `| F | ${d.F} | D，E |`].join('\n')
    return {
      stem: `次の作業からなるプロジェクトがある。前の作業が終わればすぐに次の作業を始められ、並べて進められる作業は同時に進めるものとする。プロジェクト全体の最短の所要日数は何日か。\n${table}`,
      ...choicesOf(rng, `${best}日`, [`${sum}日`, `${Math.min(...tot)}日`, `${best + 1}日`, `${best - 1}日`]),
      explanation: `始めから終わりまでの道筋は、A→B→D→F（${tot[0]}日）、A→C→E→F（${tot[1]}日）、A→C→D→F（${tot[2]}日）の3つです。すべての作業が終わるには、いちばん長い道筋（クリティカルパス）の日数が必要なので、**${best}日** です。すべての日数の合計（${sum}日）は、作業を1つずつ順番に行ったときの日数です。`,
    }
  },
}

// ---- セキュリティ ----
D.risk = {
  name: 'リスク値の比較', cat: 'リスク評価', desc: '資産価値 × 脅威 × 脆弱性',
  gen(rng) {
    let rows, vals
    for (let g = 0; g < 50; g++) {
      rows = ['A', 'B', 'C', 'D'].map((k) => ({ k, v: ri(rng, 1, 5), t: ri(rng, 1, 3), w: ri(rng, 1, 3) }))
      vals = rows.map((r) => r.v * r.t * r.w)
      const mx = Math.max(...vals)
      const maxV = Math.max(...rows.map((r) => r.v))
      if (vals.filter((x) => x === mx).length === 1 && rows[vals.indexOf(mx)].v !== maxV) break
    }
    const mx = Math.max(...vals)
    const win = rows[vals.indexOf(mx)]
    const table = ['| 情報資産 | 資産価値 | 脅威 | 脆弱性 |', ...rows.map((r) => `| 資産${r.k} | ${r.v} | ${r.t} | ${r.w} |`)].join('\n')
    return {
      stem: `リスク値を「資産価値 × 脅威 × 脆弱性」で求める。次の情報資産のうち、リスク値が最も大きいものはどれか。\n${table}`,
      ...choicesOf(rng, `資産${win.k}`, rows.filter((r) => r !== win).map((r) => `資産${r.k}`)),
      explanation: `${rows.map((r, i) => `資産${r.k}：${r.v}×${r.t}×${r.w}＝${vals[i]}`).join('、')}。最も大きいのは **資産${win.k}（${mx}）** です。資産価値が高いだけでは、リスク値が最も大きいとは限りません。`,
    }
  },
}
D.ale = {
  name: '年間予想損失額', cat: 'リスク評価', desc: '1回の損失額 × 年間の発生頻度',
  gen(rng) {
    let L, f1, f2, cost, a1, a2, net
    // 正味の効果がプラスで、選択肢が重ならない数字になるまで選び直す
    for (let g = 0; g < 100; g++) {
      L = pick(rng, [200, 400, 500, 800, 1000, 1200]); f1 = pick(rng, [0.5, 0.4, 0.25, 0.2]); f2 = pick(rng, [0.1, 0.05]); cost = pick(rng, [20, 30, 40, 50])
      a1 = round(L * f1, 2); a2 = round(L * f2, 2); net = round(a1 - a2 - cost, 2)
      if (net > 0 && new Set([net, a1 - a2, a2, a1 - cost]).size === 4) break
    }
    if (rng() < 0.5) {
      return {
        stem: `ある事故が1回起きたときの損失額は ${comma(L)} 万円、発生頻度は年 ${f1} 回と見積もられた。年間予想損失額は何万円か。`,
        ...choicesOf(rng, `${comma(round(a1, 2))}万円`, [`${comma(round(L / f1, 2))}万円`, `${comma(L)}万円`, `${comma(round(a1 / 2, 2))}万円`]),
        explanation: `年間予想損失額 ＝ 1回の損失額 × 年間の発生頻度 ＝ ${comma(L)} × ${f1} ＝ **${comma(round(a1, 2))}万円** です。`,
      }
    }
    return {
      stem: `ある事故が1回起きたときの損失額は ${comma(L)} 万円、発生頻度は年 ${f1} 回と見積もられた。年間 ${cost} 万円の対策を入れると、発生頻度は年 ${f2} 回に下がる。対策の正味の効果（年間予想損失額の減少分から対策費用を引いた額）は何万円か。`,
      ...choicesOf(rng, `${comma(round(net, 2))}万円`, [`${comma(round(a1 - a2, 2))}万円`, `${comma(round(a2, 2))}万円`, `${comma(round(a1 - cost, 2))}万円`]),
      explanation: `対策前は ${comma(L)} × ${f1} ＝ ${comma(round(a1, 2))}万円、対策後は ${comma(L)} × ${f2} ＝ ${comma(round(a2, 2))}万円で、減少分は ${comma(round(a1 - a2, 2))}万円です。対策費用 ${cost}万円を引くと、正味の効果は **${comma(round(net, 2))}万円** です。`,
    }
  },
}
D.password = {
  name: 'パスワードの組合せ数', cat: '認証', desc: '文字の種類 ＾ けた数',
  gen(rng) {
    const [kinds, label] = pick(rng, [[10, '数字（0〜9）'], [26, '英小文字（a〜z）'], [36, '英小文字と数字'], [62, '英大文字・英小文字・数字']])
    const n = pick(rng, [4, 6, 8, 10])
    return {
      stem: `${label}だけを使える、${n}けたのパスワードがある。作れるパスワードは何通りか。`,
      ...choicesOf(rng, `${kinds}${sup(n)} 通り`, [`${n}${sup(kinds)} 通り`, `${comma(kinds * n)} 通り`, `${kinds}${sup(n - 1)} 通り`, `${kinds}${sup(n + 1)} 通り`, `${n}${sup(n)} 通り`]),
      explanation: `1けたごとに ${kinds} 通りの文字を選べ、それが ${n} けた続くので、${kinds} を ${n} 回かけて **${kinds}${sup(n)} 通り** です。使える文字の種類やけた数を増やすと、総当たり攻撃で見つけるのに時間がかかるようになります。`,
    }
  },
}

// ---- テスト技法（JSTQB） ----
D.ep = {
  name: '同値分割（テストケース数）', cat: 'テスト技法', desc: '同値パーティションを数える',
  gen(rng) {
    const lo = pick(rng, [1, 6, 10, 18, 20]), hi = lo + pick(rng, [9, 29, 46, 79, 99])
    const what = pick(rng, ['年齢（整数）', '数量（整数）', '点数（整数）'])
    return {
      stem: `入力欄は、${what}として ${lo} 以上 ${hi} 以下の値だけを受け付け、それ以外はエラーにする。同値分割法で、すべての同値パーティション（有効・無効）から1つずつ値を選ぶとき、必要な最少のテストケース数はどれか。`,
      ...choicesOf(rng, '3個', ['2個', '4個', '6個', `${hi - lo + 1}個`]),
      explanation: `同値パーティションは「${lo - 1}以下（無効）」「${lo}〜${hi}（有効）」「${hi + 1}以上（無効）」の3つです。それぞれから1つずつ選ぶので **3個** です。4個は2値境界値分析で選ぶ値（${lo - 1}，${lo}，${hi}，${hi + 1}）の数と混同したものです。`,
    }
  },
}
D.bva = {
  name: '2値境界値分析', cat: 'テスト技法', desc: '境界の値と、となりの値',
  gen(rng) {
    const lo = pick(rng, [1, 5, 10, 18, 20, 100]), hi = lo + pick(rng, [9, 29, 49, 99])
    const f = (arr) => arr.join('，')
    return {
      stem: `入力欄は ${lo} 以上 ${hi} 以下の整数だけを受け付ける。2値境界値分析（それぞれの境界について、境界の値と、となりのパーティションにある最も近い値の2つを選ぶ方法）でテストするとき、選ぶ値の組として正しいものはどれか。`,
      ...choicesOf(rng, f([lo - 1, lo, hi, hi + 1]), [f([lo, lo + 1, hi - 1, hi]), f([lo - 2, lo - 1, hi + 1, hi + 2]), f([lo, Math.round((lo + hi) / 2), hi]), f([lo - 1, lo + 1, hi - 1, hi + 1])]),
      explanation: `有効なパーティション（${lo}〜${hi}）の境界値は ${lo} と ${hi}、そのすぐ外側の無効なパーティションの境界値は ${lo - 1} と ${hi + 1} です。2値境界値分析では、この4つ（**${f([lo - 1, lo, hi, hi + 1])}**）を選びます。有効な側の値だけでは、範囲外の値を受け付けてしまう欠陥を見つけられません。`,
    }
  },
}
D.dtable = {
  name: 'デシジョンテーブルの列数', cat: 'テスト技法', desc: '条件の組合せの数',
  gen(rng) {
    const n = pick(rng, [2, 3, 4, 5])
    return {
      stem: `「はい・いいえ」の2つの値をとる条件が ${n} つある。条件の組合せをすべて書いたデシジョンテーブルの列（ルール）の数はどれか。`,
      ...choicesOf(rng, `${2 ** n}列`, [`${2 * n}列`, `${n * n}列`, `${n}列`, `${2 ** n - 1}列`, `${2 ** (n + 1)}列`, `${n + 1}列`]),
      explanation: `条件ごとに2通りあり、それが ${n} つあるので、2 を ${n} 回かけて 2${sup(n)} ＝ **${2 ** n}列** です。実際には、ありえない組合せを消したり、まとめたりして列を減らすこともあります。`,
    }
  },
}
D.coverage = {
  name: 'カバレッジ（網羅率）', cat: 'テスト技法', desc: '実行した数 ÷ 全体の数',
  gen(rng) {
    const kind = pick(rng, [['ステートメント', 'ステートメント（命令文）'], ['ブランチ', '判定の分岐（ブランチ）']])
    const total = pick(rng, [20, 40, 50, 80])
    const pct = pick(rng, [50, 60, 75, 80, 90])
    const run = total * pct / 100
    return {
      stem: `テスト対象のプログラムには ${kind[1]} が ${total} ある。テストを実行したところ、そのうち ${run} を通った。${kind[0]}カバレッジは何％か。`,
      ...choicesOf(rng, `${pct}％`, [`${100 - pct}％`, `${Math.round(total / run * 100)}％`, '100％', `${pct - 10}％`]),
      explanation: `カバレッジ ＝ 通った数 ÷ 全体の数 × 100 ＝ ${run} ÷ ${total} × 100 ＝ **${pct}％** です。100％にしても、すべての欠陥が見つかるとは限りません。`,
    }
  },
}

// ---- Web広告・アクセス解析 ----
D.admetrics = {
  name: '広告の指標（CTR・CPC・CPA・ROAS）', cat: '広告の指標', desc: '表示・クリック・費用・成果から',
  gen(rng) {
    const imp = pick(rng, [10000, 20000, 40000, 50000])
    const ctr = pick(rng, [2, 2.5, 4, 5]) / 100
    const clicks = imp * ctr
    const cpc = pick(rng, [40, 50, 80, 100, 120])
    const cost = clicks * cpc
    const cvr = pick(rng, [2, 4, 5]) / 100
    const cv = Math.round(clicks * cvr)
    const value = cost * pick(rng, [3, 4, 5, 6])
    const kind = pick(rng, ['ctr', 'cpc', 'cpa', 'roas'])
    const base = `ある検索広告の1か月の数字は、表示回数 ${comma(imp)} 回、クリック数 ${comma(clicks)} 回、費用 ${comma(cost)} 円、コンバージョン ${cv} 件、コンバージョン値（売上）${comma(value)} 円だった。`
    if (kind === 'ctr') return {
      stem: base + 'クリック率（CTR）はどれか。',
      ...choicesOf(rng, `${dec(ctr * 100, 2)}％`, [`${dec(cv / clicks * 100, 2)}％`, `${dec(imp / clicks, 2)}％`, `${dec(ctr * 1000, 2)}％`, `${dec(ctr * 10, 2)}％`], () => `${dec(ctr * 100 + ri(rng, 1, 9) / 2, 2)}％`),
      explanation: `クリック率 ＝ クリック数 ÷ 表示回数 × 100 ＝ ${comma(clicks)} ÷ ${comma(imp)} × 100 ＝ **${dec(ctr * 100, 2)}％** です。`,
    }
    if (kind === 'cpc') return {
      stem: base + '平均クリック単価（CPC）はどれか。',
      ...choicesOf(rng, `${comma(cpc)}円`, [`${comma(Math.round(cost / cv))}円`, `${dec(cost / imp, 2)}円`, `${comma(cpc * 2)}円`], () => `${comma(cpc + ri(rng, 1, 9) * 10)}円`),
      explanation: `平均クリック単価 ＝ 費用 ÷ クリック数 ＝ ${comma(cost)} ÷ ${comma(clicks)} ＝ **${comma(cpc)}円** です。費用 ÷ コンバージョン数は、コンバージョン単価（CPA）です。`,
    }
    if (kind === 'cpa') return {
      stem: base + 'コンバージョン単価（CPA：1件の成果にかかった費用）はどれか。',
      ...choicesOf(rng, `${comma(Math.round(cost / cv))}円`, [`${comma(cpc)}円`, `${comma(Math.round(value / cv))}円`, `${comma(Math.round(cost / cv / 2))}円`], () => `${comma(Math.round(cost / cv) + ri(rng, 1, 9) * 100)}円`),
      explanation: `コンバージョン単価 ＝ 費用 ÷ コンバージョン数 ＝ ${comma(cost)} ÷ ${cv} ＝ **${comma(Math.round(cost / cv))}円** です。${comma(cpc)}円は1クリックあたりの費用（平均クリック単価）です。`,
    }
    return {
      stem: base + '広告費用対効果（ROAS）はどれか。',
      ...choicesOf(rng, `${Math.round(value / cost * 100)}％`, [`${Math.round(cost / value * 100)}％`, `${Math.round((value - cost) / cost * 100)}％`, `${Math.round(value / cost * 10)}％`], () => `${Math.round(value / cost * 100) + ri(rng, 1, 9) * 50}％`),
      explanation: `ROAS ＝ コンバージョン値 ÷ 広告費 × 100 ＝ ${comma(value)} ÷ ${comma(cost)} × 100 ＝ **${Math.round(value / cost * 100)}％** です。広告費1円あたり ${value / cost} 円の売上があったことを表します。`,
    }
  },
}
D.engage = {
  name: 'エンゲージメント率と直帰率', cat: 'GA4の指標', desc: 'セッションの数から割合を',
  gen(rng) {
    const ses = pick(rng, [1000, 2000, 4000, 5000, 8000])
    const er = pick(rng, [40, 45, 55, 60, 65, 70])
    const eng = ses * er / 100
    if (rng() < 0.5) return {
      stem: `GA4 で、ある月のセッション数は ${comma(ses)}、エンゲージメントのあったセッション数は ${comma(eng)} だった。この月の直帰率はどれか。`,
      ...choicesOf(rng, `${100 - er}％`, [`${er}％`, `${Math.round(ses / eng * 100)}％`, `${Math.round((100 - er) / 2)}％`]),
      explanation: `エンゲージメント率 ＝ ${comma(eng)} ÷ ${comma(ses)} ＝ ${er}％ です。GA4 の直帰率は「エンゲージメントのなかったセッション」の割合なので、100％ − ${er}％ ＝ **${100 - er}％** です。`,
    }
    return {
      stem: `GA4 で、ある月のセッション数は ${comma(ses)}、直帰率は ${100 - er}％ だった。この月の「エンゲージメントのあったセッション数」はどれか。`,
      ...choicesOf(rng, comma(eng), [comma(ses - eng), comma(ses), comma(Math.round(eng / 2))]),
      explanation: `直帰率はエンゲージメントのなかったセッションの割合なので、エンゲージメント率は 100％ − ${100 - er}％ ＝ ${er}％ です。${comma(ses)} × ${er}％ ＝ **${comma(eng)}** です。${comma(ses - eng)} は直帰したセッションの数です。`,
    }
  },
}
D.msgcount = {
  name: 'メッセージの通数', cat: 'メッセージ配信', desc: '送った回数 × 送った友だちの数',
  gen(rng) {
    const added = pick(rng, [800, 1000, 1500, 2000, 3000])
    const blocked = pick(rng, [100, 200, 300, 500])
    const times = pick(rng, [2, 3, 4, 8])
    const reach = added - blocked
    return {
      stem: `分析画面で、友だち追加数が ${comma(added)}、ブロック数が ${comma(blocked)} だった（友だち追加数は、あとでブロックした人も含めた数とする）。ブロックしていない友だち全員に、1か月に ${times} 回メッセージを配信した。その月の通数はいくつか。ほかの条件は考えないものとする。`,
      ...choicesOf(rng, `${comma(reach * times)}通`, [`${comma(added * times)}通`, `${comma(reach)}通`, `${comma((added + blocked) * times)}通`]),
      explanation: `ブロックしている友だちにはメッセージが届かないので、送る相手は ${comma(added)} − ${comma(blocked)} ＝ ${comma(reach)}人です。通数は「送った回数 × 送った友だちの数」なので、${times} × ${comma(reach)} ＝ **${comma(reach * times)}通** です。`,
    }
  },
}

// 資格ごとに使うドリル
export const DRILLS_BY_CERT = {
  itpass: ['bin2dec', 'dec2bin', 'hex', 'bits', 'avail', 'mtbf', 'breakeven', 'profit', 'roi', 'image', 'transfer', 'critical', 'password'],
  sg: ['risk', 'ale', 'avail', 'mtbf', 'password'],
  jstqb: ['ep', 'bva', 'dtable', 'coverage'],
  gads: ['admetrics'],
  ga4: ['engage'],
  'line-basic': ['msgcount'],
}
export const drill = (type) => D[type]
export function makeDrill(type, n = 10, rng = Math.random) {
  const d = D[type]
  const out = []
  const seen = new Set()
  let guard = 0
  while (out.length < n && guard++ < n * 20) {
    const q = d.gen(rng)
    if (seen.has(q.stem) && guard < n * 10) continue
    seen.add(q.stem)
    out.push({ ...q, type, name: d.name })
  }
  return out
}
export function drillMix(types, n = 10, rng = Math.random) {
  const out = []
  for (let i = 0; i < n; i++) out.push(...makeDrill(types[Math.floor(rng() * types.length)], 1, rng))
  return out
}
