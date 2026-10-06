export const meta = {
  name: 'gokaku-fill-residual',
  description: '合格ノート：網羅率の残り（言いかえで見つからなかった用語・活用例）を確かめ、本当に足りないものだけ用語辞典に足して点検する',
  phases: [{ title: '残りの確認', detail: '資格ごとに 確認・作成 → 点検' }],
}
const F = args.fill, APP = args.app, SYL = args.syl
const NAME = { itpass: 'ITパスポート', sg: '情報セキュリティマネジメント', genai: '生成AIパスポート' }
const SRCFILES = { itpass: `${SYL}/ip65.raw.txt（今の試験）と ${SYL}/ip01.raw.txt（2027年度からの新しい試験のシラバス案）`, sg: `${SYL}/sg41.raw.txt（今の試験）と ${SYL}/sg01.raw.txt（2027年度からの新しい試験のシラバス案）`, genai: `${SYL}/genai.raw.txt（2027年2月試験から適用のシラバス）` }
const CATS = { itpass: 's1 企業と法務、s2 経営戦略、s3 システム戦略、m1 開発技術、m2 プロジェクトマネジメント、m3 サービスマネジメント・監査、t1 基礎理論とアルゴリズム、t2 コンピュータシステム、t3 セキュリティ、t4 データベース・ネットワーク、t5 情報デザイン・メディア、n1〜n4（2027年度からの新しい範囲：n1 ビジネス変革・マインド、n2 データマネジメント、n3 デジタル技術、n4 情報倫理・法規）', sg: 'a1 情報セキュリティ全般、a2 情報セキュリティ管理、a3 情報セキュリティ対策、a4 関連法規、a5 関連分野、b 科目B', genai: 'c1 第1章、c2 第2章、c3 第3章、c4 第4章、c5 第5章（新シラバスの章番号に合わせる）' }
const GLOSS = `{"term":"シラバスの表記","reading":"漢字をふくむときは、ひらがなの読み（なければ空文字）","meaning":"1〜2文、90字以内。やさしい言葉で、試験で問われる要点","example":"身近な例を1文・60字以内（なくてよい）","cat":"アプリの分野id","src":"範囲を短く"}`
const writer = (cert) => `学習アプリ「合格ノート」の「${NAME[cert]}」で、公式シラバスの項目のうち、機械的な文字の照合では見つからなかった「残り」を確かめます。間違った知識を覚えさせないことが最優先です。
入力：${F}/${cert}.input.json の items（term、alt、area、kind：term・example（活用例）・skill・topic、source：どのシラバスか）
アプリの今の内容（Grep などで探す）：教科書 ${APP}/data/lessons/${cert}.json、用語 ${APP}/data/terms/${cert}.json、用語辞典 ${APP}/data/glossary/${cert}.json、問題 ${APP}/data/questions/${cert}.json と ${APP}/data/extra/ の ${cert}- で始まるファイル、要点まとめ ${APP}/data/summaries/${cert}.json
公式の資料：${SRCFILES[cert]}
アプリの分野id：${CATS[cert]}

やること：
1. 各項目が、アプリのどこかで別の言い方・まとまった説明として扱われているかを確かめる（例：「監査証拠の入手と評価」→ 教科書のシステム監査の回の手順にある）。扱われていれば covered に入れ、where に場所（ファイルと用語・回の id）を書く。
2. 本当に扱われていない項目だけ、用語辞典の項目を書く：${GLOSS}
   - 事実は確かなことだけ。法律・制度・数値・製品の名前や仕様は、公式の情報で確かめる（ToolSearch で WebSearch・WebFetch）。確かめられなければ skipped に理由を書く。
   - 「C」「R」「和」のような短すぎる語は、シラバスの前後の文から何を指すかを確かめてから書く（例：「C」はプログラム言語の C）。
書き出し（Write ツール）：${F}/${cert}.json に {"covered":[{"term":"…","where":"…"}],"glossary":[…],"skipped":[{"term":"…","reason":"…"}]}
返す内容：covered・glossary・skipped の数。`
const verifier = (cert) => `学習アプリ「合格ノート」の「${NAME[cert]}」に足す予定の用語辞典 ${F}/${cert}.json を点検します。間違った知識を覚えさせないことが最優先です。
入力：${F}/${cert}.input.json、公式の資料：${SRCFILES[cert]}、アプリの今の内容：用語辞典 ${APP}/data/glossary/${cert}.json、教科書 ${APP}/data/lessons/${cert}.json、用語 ${APP}/data/terms/${cert}.json
1. glossary の各項目：定義が正しいか、シラバスでの意味と合っているか、言い過ぎ・古い情報がないか、やさしいか、cat が正しいか。疑わしいものは公式の情報で確かめて直し（ToolSearch で WebSearch・WebFetch）、確かめられないものは消す。
2. covered の判断から15個を選び、本当にアプリで説明されているかを確かめる。されていなければ glossary に足す。
直したものを Write ツールで ${F}/${cert}.verified.json（同じ形）に、直した点を ${F}/${cert}.changes.md に書く。
返す内容：直した数（fixed）、消した数（removed）、足した数（added）。`
const W = { type: 'object', properties: { covered: { type: 'integer' }, glossary: { type: 'integer' }, skipped: { type: 'integer' } }, required: ['covered', 'glossary', 'skipped'] }
const V = { type: 'object', properties: { fixed: { type: 'integer' }, removed: { type: 'integer' }, added: { type: 'integer' } }, required: ['fixed', 'removed', 'added'] }
return await pipeline(
  ['itpass', 'sg', 'genai'],
  (cert) => agent(writer(cert), { phase: '残りの確認', label: `確認・作成 ${cert}`, schema: W, effort: 'high' }),
  (w, cert) => agent(verifier(cert), { phase: '残りの確認', label: `点検 ${cert}`, schema: V, effort: 'high' }).then((v) => ({ cert, written: w, verified: v })),
)
