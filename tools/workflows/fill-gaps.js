export const meta = {
  name: 'gokaku-fill-gaps',
  description: '合格ノート：公式の出題範囲で説明がない用語・単元を、用語辞典と教科書の回で埋め、別のAIが点検する',
  phases: [
    { title: '穴うめ', detail: 'まとまりごとに 作成 → 点検' },
    { title: '照合', detail: '2027年新範囲の教科書・問題をシラバス案と照合' },
  ],
}
const FILL = args.fill, APP = args.app, SYL = args.syl

const CERT_NAME = { itpass: 'ITパスポート', sg: '情報セキュリティマネジメント', genai: '生成AIパスポート', ga4: 'Google アナリティクス 4（GA4）認定資格', gads: 'Google 広告の検索広告認定資格', 'line-basic': 'LINE公式アカウント Basic・Advanced（LINEヤフー マーケティングスキルバッジ）', jstqb: 'JSTQB Foundation Level' }
const SOURCE = {
  ip65: { name: 'ITパスポート試験 シラバス Ver.6.5（今の試験）', file: 'ip65.raw.txt' },
  ip01: { name: 'ITパスポート試験 シラバス（案）Ver.0.1（2027年度からの新しい試験）', file: 'ip01.raw.txt' },
  sg41: { name: '情報セキュリティマネジメント試験 シラバス Ver.4.1（今の試験）', file: 'sg41.raw.txt' },
  sg01: { name: '情報セキュリティマネジメント試験 シラバス（案）Ver.0.1（2027年度からの新しい試験）', file: 'sg01.raw.txt' },
  genai: { name: '生成AIパスポート試験 シラバス（GUGA・2027年2月試験より適用）', file: 'genai.raw.txt' },
  jstqb: { name: 'JSTQB Foundation Level シラバス 2023V4.0.J02', file: 'jstqb_fl.raw.txt' },
}
const CATS = {
  ip65: 's1 企業と法務（シラバス大分類1）、s2 経営戦略（大分類2）、s3 システム戦略（大分類3）、m1 開発技術（大分類4）、m2 プロジェクトマネジメント（大分類5）、m3 サービスマネジメント・監査（大分類6）、t1 基礎理論とアルゴリズム（大分類7）、t2 コンピュータシステム（大分類8）、大分類9 技術要素のうち t3 セキュリティ、t4 データベース・ネットワーク、t5 情報デザイン・情報メディア（ヒューマンインタフェース・マルチメディア）',
  ip01: '新しい試験だけの用語なので、n1 新範囲：ビジネス変革・マインド（ビジネス変革の方法論、デザインのアプローチ、マインド・スタンス、DX・デジタル戦略、組織活動）、n2 新範囲：データマネジメント（データマネジメント、データ分析・データ利活用）、n3 新範囲：デジタル技術（AI利活用・AI技術、クラウド、デジタルサービス・ツール、システムの種類・構成、ネットワークなど）、n4 新範囲：情報倫理・法規（情報倫理・AI倫理、法規・ガイドライン）。セキュリティの用語は t3 でもよい',
  sg41: 'a1 情報セキュリティ全般（脅威・攻撃手法・暗号・認証など）、a2 情報セキュリティ管理（リスク・ISMS・管理策・CSIRTなど）、a3 情報セキュリティ対策（技術的・人的・物理的な対策）、a4 関連法規（法律・ガイドライン・規格）、a5 関連分野（テクノロジ・マネジメント・ストラテジのセキュリティ以外の用語）、b 科目B（事例・技能）',
  sg01: 'a1 情報セキュリティ全般、a2 情報セキュリティ管理、a3 情報セキュリティ対策、a4 関連法規、a5 関連分野、b 科目B（事例・技能）',
  genai: 'c1 第1章 AIの基礎と歴史、c2 第2章 生成AI、c3 第3章 AIエージェント、c4 第4章 生成AIのリスク予防・AI倫理・ガバナンス、c5 第5章 生成AIの実践と活用事例（シラバスの章番号と同じ）',
  ga4: 'a1 GA4の基本と設定、a2 イベントとキーイベント、a3 レポート、a4 データ探索とオーディエンス、a5 データ管理とプライバシー、a6 連携とアトリビューション',
  gads: 'g1 検索広告のしくみ、g2 キーワードとマッチタイプ、g3 広告文とアセット、g4 入札戦略と予算、g5 AIを活用した検索広告、g6 測定と最適化',
  line: 'Basic（cert は line-basic）：lb1 LINE公式アカウントのご紹介、lb2 開設、lb3 運用の流れ、lb4 目標やKPIの立て方、lb5 初期設定、lb6 友だちを集める手法、lb7 メッセージ機能、lb8 その他の機能、lb9 運用時の注意点。Advanced（cert は line-adv）：la1 広告で友だちを集める、la2 友だちデータの活用、la3 運用戦略を立てる、la4 配信の効果を改善する、la5 配信の効果を計測する、la6 APIの利用、la7 APIの活用事例',
  jstqb: 'ch1 第1章 テストの基礎、ch2 第2章 開発ライフサイクルとテスト、ch3 第3章 静的テスト、ch4 第4章 テスト分析と設計、ch5 第5章 テスト活動のマネジメント、ch6 第6章 テストツール',
}
const APPDATA = (cert) => cert === 'line-basic'
  ? `教科書 ${APP}/data/lessons/line-basic.json と line-adv.json、用語 ${APP}/data/terms/line-basic.json と line-adv.json、問題 ${APP}/data/questions/line-basic.json と line-adv.json、要点まとめ ${APP}/data/summaries/line-basic.json と line-adv.json`
  : `教科書 ${APP}/data/lessons/${cert}.json、用語 ${APP}/data/terms/${cert}.json、問題 ${APP}/data/questions/${cert}.json と ${APP}/data/extra/ の ${cert}- で始まるファイル、要点まとめ ${APP}/data/summaries/${cert}.json`

const FORMAT = `教科書の回の本文（body）の書き方（この形だけ）：「## 見出し」（1回に2〜4つ）／ふつうの段落（1〜3文。段落のあいだは空行）／「- 」の箇条書き／「1. 」の手順／「| 見出し1 | 見出し2 |」の行が2行以上続くと表（区切り行 |---| は書かない）／「> 」大事なポイント（1回に1〜2つ）／「例：」で始まる段落は身近な例／強調は **ことば**（1段落に1か所まで）。本文は600〜1,100字、です・ます調、やさしい言葉、専門用語は（ ）で言いかえる。`
const GLOSS = `用語辞典の1項目：{"term":"シラバスの表記（（ ）の補足は省いてよい）","reading":"漢字をふくむときは、ひらがなの読み（なければ空文字）","meaning":"1〜2文、90字以内。やさしい言葉で、試験で問われる要点","example":"身近な例を1文・60字以内（なくてよい）","cat":"アプリの分野id","src":"範囲を短く（例：シラバスVer.6.5 企業と法務 > 経営・組織論）"}`
const FACTS = `事実は確かなことだけ。法律・規格・制度・数値・製品やサービスの名前や仕様は、公式の情報（官公庁・標準化団体・提供元の公式ページ）で確かめる（ToolSearch で WebSearch・WebFetch を読み込んで使う）。確かめられないものは書かずに skipped に理由を書く。シラバスの本文の前後を読み、その用語がどの意味で使われているかを確かめる。`
const LESSON_OBJ = (c) => `教科書の回：{"cert":"${c.cert === 'line-basic' ? 'line-basic または line-adv' : c.cert}","cat":"分野id","id":"<cert>-<分野id>-${c.key}-<番号1から>","title":"20字くらいまで","minutes":4,"goals":["この回でわかること 2〜3個"],"body":"…","check":["実在する問題の id（2〜4個。合うものがなければ空配列）"]}`

function writerPrompt(c) {
  const head = `学習アプリ「合格ノート」の「${CERT_NAME[c.cert]}」で、公式の出題範囲のうち、アプリにまだ説明がない内容をうめます。間違った知識を覚えさせないことが最優先です。
入力：${FILL}/${c.key}.input.json の items
アプリの今の内容（Grep などで探して確かめる）：${APPDATA(c.cert)}
アプリの分野id：${CATS[c.source] || CATS[c.cert]}
${FORMAT}
${GLOSS}
${LESSON_OBJ(c)}
${FACTS}`
  if (c.mode === 'terms') {
    return `${head}
公式の資料：${SOURCE[c.source].name} の本文 ${SYL}/${SOURCE[c.source].file}
items の status：missing＝アプリのどこにもない、mentioned＝問題文・選択肢にだけある。kind：term（用語例）、example（活用例）、topic（学習項目）、skill（科目Bの技能）。

やること：
1. 各項目が、アプリのどこかで別の言い方で説明されていないかを確かめる（略語・正式名・言いかえ）。説明されていれば covered に入れる（where に場所）。
2. 説明がない項目は、用語辞典の項目を書く。kind が example・topic・skill のものも、同じ形で短く説明する。
3. 用語辞典だけでは分かりにくい、まとまった内容（しくみ・手順・計算・比較）が足りない分野には、教科書の回を足す（このまとまりで最大4回）。
書き出し（Write ツール）：${FILL}/${c.key}.json に {"covered":[{"term":"…","where":"…"}],"glossary":[…],"lessons":[…],"skipped":[{"term":"…","reason":"…"}]}
返す内容：covered・glossary・lessons・skipped の数。`
  }
  if (c.mode === 'topics') {
    return `${head}
入力の items は、公式の学習コースの単元（kind topic。area にコース・単元と、確認したページのURL）です。

やること：
1. 各単元が、アプリの教科書・用語・問題で学べるかを判断する（covered：十分／partial：一部だけ／missing：ない）。理由と、アプリのどこにあるか（where）も書く。
2. partial・missing の単元は、教科書の回（最大6回）と用語辞典の項目で補う。内容は、${c.cert === 'line-basic' ? 'LINEヤフー for Business の公式ページ（https://www.lycbiz.com/ など）' : 'Google の公式ヘルプ（https://support.google.com/ など）'}で確かめた事実だけにし、確かめたページのURLを src に書く。画面や機能の名前・数値は、公式ページの今の表記に合わせる。
書き出し（Write ツール）：${FILL}/${c.key}.json に {"judgement":[{"topic":"…","status":"covered|partial|missing","where":"…","reason":"…"}],"glossary":[…],"lessons":[…],"skipped":[…]}
返す内容：judgement の covered・partial・missing の数、glossary と lessons の数。`
  }
  return `${head}
公式の資料：${SOURCE.jstqb.name} の本文 ${SYL}/${SOURCE.jstqb.file}
入力の items：kind lo（学習目標。FL-1.1.1 などの番号と文）と、kind term（キーワードのうち、アプリで見つからなかったもの）。

やること：
1. 各学習目標を、アプリの教科書（${APP}/data/lessons/jstqb.json）で達成できるかを判断する（covered／partial／missing。根拠の回の id を where に）。
2. partial・missing の学習目標は、教科書の回を足す（最大6回）か、既存の回への追記で補う。追記は {"lesson":"既存の回の id","body":"追記する本文（同じ書き方。## 見出しから始める）"} を append に入れる。内容はシラバスの本文に合わせる。
3. term の項目は、別の言い方でアプリにあれば covered、なければ用語辞典に書く。
書き出し（Write ツール）：${FILL}/${c.key}.json に {"judgement":[{"topic":"FL-…","status":"…","where":"…"}],"covered":[…],"glossary":[…],"lessons":[…],"append":[…],"skipped":[…]}
返す内容：judgement の covered・partial・missing の数、glossary・lessons・append の数。`
}

function verifierPrompt(c) {
  return `学習アプリ「合格ノート」の「${CERT_NAME[c.cert]}」に足す予定の内容 ${FILL}/${c.key}.json（用語辞典 glossary・教科書の回 lessons${c.mode === 'lo' ? '・既存の回への追記 append' : ''}）を点検します。間違った知識を覚えさせないことが最優先です。
入力（もとの項目）：${FILL}/${c.key}.input.json
${c.mode === 'terms' || c.mode === 'lo' ? `公式の資料：${SOURCE[c.source].name} の本文 ${SYL}/${SOURCE[c.source].file}` : '公式の資料：Google／LINEヤフーの公式ヘルプ・公式ページ（src のURL）'}
アプリの今の内容：${APPDATA(c.cert)}
アプリの分野id：${CATS[c.source] || CATS[c.cert]}
${FORMAT}

点検すること：
1. 用語辞典の各項目：定義が正しいか、シラバス（公式の資料）での意味と合っているか、言い過ぎ・古い情報・誤解を招く書き方がないか、やさしい言葉か、cat が正しいか。疑わしいものは公式の情報で確かめて直す（ToolSearch で WebSearch・WebFetch）。確かめられないものは消す（removed に理由）。
2. ${c.mode === 'terms' ? 'covered と判断された項目から10個を選び、本当にアプリで説明されているかを確かめる。されていなければ、用語辞典の項目を足す。' : 'judgement の covered の判断から5個を選び、本当にアプリで学べるかを確かめる。学べなければ、教科書の回か用語辞典で補う。'}
3. 教科書の回${c.mode === 'lo' ? 'と追記' : ''}：事実・言い過ぎ・分かりやすさ・書き方・check の id が実在し、その回の内容で解けるか（解けないものは外す）。
直したものを Write ツールで ${FILL}/${c.key}.verified.json（同じ形）に、直した点を ${FILL}/${c.key}.changes.md に書く。
返す内容：直した数（fixed）、消した数（removed）、足した数（added）。`
}

const W = { type: 'object', properties: { glossary: { type: 'integer' }, lessons: { type: 'integer' }, covered: { type: 'integer' }, skipped: { type: 'integer' } }, required: ['glossary', 'lessons'] }
const V = { type: 'object', properties: { fixed: { type: 'integer' }, removed: { type: 'integer' }, added: { type: 'integer' } }, required: ['fixed', 'removed', 'added'] }
const R = { type: 'object', properties: { fixes: { type: 'integer' } }, required: ['fixes'] }

const fill = pipeline(
  args.chunks,
  (c) => agent(writerPrompt(c), { phase: '穴うめ', label: `作成 ${c.key}`, schema: W, effort: 'high' }),
  (w, c) => agent(verifierPrompt(c), { phase: '穴うめ', label: `点検 ${c.key}`, schema: V, effort: 'high' }).then((v) => ({ key: c.key, written: w, verified: v })),
)
const reverify = agent(`ITパスポート試験 シラバス（案）Ver.0.1 の本文 ${SYL}/ip01.raw.txt と照らして、学習アプリ「合格ノート」の「2027年からの新しい範囲」の教科書（${APP}/data/lessons/itpass.json の章のうち cat が n1・n2・n3・n4 のもの）と問題（${APP}/data/extra/itpass-n27.json）を点検します。
シラバス案と食い違う記述、シラバス案にない内容を「シラバス案にある」と書いているところ、言い過ぎ、古い情報がないかを確かめる。疑わしいときは公式の情報も確かめる（ToolSearch で WebSearch・WebFetch）。
ファイルは直接書きかえず、直す必要があるものを Write ツールで ${FILL}/ip-new-reverify.json に {"fixes":[{"file":"lessons または n27","id":"レッスンか問題の id","field":"body・title・goals・stem・choices・explanation・source のどれか","old":"直す前の文（ファイルの中の文そのまま。短く一部でよい）","new":"直した文","reason":"…"}]} の形で書く（なければ fixes は空配列）。
返す内容：fixes の数。`, { phase: '照合', label: '照合 2027年新範囲', schema: R, effort: 'high' })

const [fr, rv] = await Promise.all([fill, reverify])
return { fill: fr, reverify: rv }
