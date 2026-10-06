export const meta = {
  name: 'gokaku-coverage-extract',
  description: '合格ノート：公式シラバス・公式コースから出題範囲のキーワード一覧を正確に書き出す（網羅率を数えるため）',
  phases: [{ title: '書き出し', detail: '資格ごとに、公式の出題範囲のキーワードを一覧にする' }],
}
const SYL = args.syl
const SCHEMA = { type: 'object', properties: { count: { type: 'integer' }, areas: { type: 'integer' } }, required: ['count', 'areas'] }
const COMMON = `
書き出しの形（Write ツールで JSON 配列）：
[{"area":"出題範囲の区分（例：「大分類1 企業と法務 > 中分類1 企業活動 > 1 経営・組織論」）","term":"キーワード（原文どおりの主な表記）","alt":["別の言い方・略語・正式名称（原文の（ ）の中など。なければ空配列）"],"kind":"term"}]
きまり：
- 原文に書かれているキーワードを、1つも落とさず、1つずつ別の行にする。勝手に足さない、まとめない。
- 「A（B，C）」のように（ ）の中に種類が並ぶときは、A を term に、B と C も別の term として書く（area は同じ）。（ ）の中が言いかえ・略語・英語なら alt に入れる。
- ページの番号、著作権の表示、見出しの番号は入れない。PDFの字間の空白は消す。
- 返す内容：キーワードの数（count）と区分の数（areas）。`
const JOBS = [
  { key: 'ip65', prompt: `IPA「ITパスポート試験 シラバス Ver.6.5」の文字を書き出したファイル ${SYL}/ip65.raw.txt（表の形を残した版：${SYL}/ip65.txt）を読み、すべての「用語例」のキーワードを書き出してください。「活用例」は kind を "example" にして入れてください。` },
  { key: 'sg41', prompt: `IPA「情報セキュリティマネジメント試験 シラバス Ver.4.1」の文字を書き出したファイル ${SYL}/sg41.raw.txt（表の形を残した版：${SYL}/sg41.txt。表がくずれているので、両方を見比べる）を読み、科目A（目標とする知識）のすべての「用語例」のキーワードを書き出してください。科目B（目標とする技能）の項目は、短い題（例：「情報資産の特定」）にして kind を "skill" で入れてください。` },
  { key: 'ip01', prompt: `IPA「ITパスポート試験 シラバス（案）Ver.0.1」（2027年度からの新しい試験）の文字を書き出したファイル ${SYL}/ip01.raw.txt（表の形を残した版：${SYL}/ip01.txt）を読み、すべての「用語例」のキーワードを書き出してください。area は「大分類 > 中分類 > 小分類 > 項目」。` },
  { key: 'sg01', prompt: `IPA「情報セキュリティマネジメント試験 シラバス（案）Ver.0.1」（2027年度からの新しい試験）の文字を書き出したファイル ${SYL}/sg01.raw.txt（表の形を残した版：${SYL}/sg01.txt）を読み、すべての「用語例」のキーワードを書き出してください。科目Bの技能の項目は、短い題にして kind を "skill" で入れてください。` },
  { key: 'jstqb', prompt: `JSTQB「Foundation Level シラバス 2023V4.0.J02」の文字を書き出したファイル ${SYL}/jstqb_fl.raw.txt（表の形を残した版：${SYL}/jstqb_fl.txt）を読み、各章の最初にある「キーワード」をすべて書き出してください（kind は "term"、area は章と節）。あわせて、すべての「学習目標」（FL-1.1.1 のような番号つき）を、番号と文のまま kind "lo" で入れてください（term に番号と文、alt は空）。` },
  { key: 'genai', prompt: `GUGA「生成AIパスポート試験 シラバス」の文字を書き出したファイル ${SYL}/genai.raw.txt（表の形を残した版：${SYL}/genai.txt）を読み、各章の学習項目と「詳細キーワード」をすべて書き出してください（学習項目は kind "topic"、詳細キーワードは kind "term"）。` },
  { key: 'ga4', prompt: `Google アナリティクス 4（GA4）認定資格の出題範囲を、公式の公開ページから調べて一覧にしてください。公開のシラバスはないので、公式の学習コース（Skillshop の GA4 コース 101・102・201・301 など）の単元名・学ぶこと、アナリティクス ヘルプの「GA4 認定資格とコース」https://support.google.com/analytics/answer/15068052?hl=ja と、そこからたどれる公式ページに書かれている学習項目を使います。ToolSearch で WebSearch・WebFetch を読み込んで使ってください。各キーワード・項目は kind "topic"、area は「コース名 > 単元名」。どのページで確かめたかは area の最後に（ ）でURLを書く。確かめられなかった推測は入れない。` },
  { key: 'gads', prompt: `Google 広告の検索広告認定資格（Google Ads Search Certification）の出題範囲を、公式の公開ページから調べて一覧にしてください。公開のシラバスはないので、Skillshop ヘルプ「学習プログラム」https://support.google.com/skillshop/answer/14741235?hl=ja、Google 広告ヘルプの認定資格のページ https://support.google.com/google-ads/answer/9702955?hl=ja と、そこからたどれる公式ページ（学習モジュールの単元名・学ぶこと）を使います。ToolSearch で WebSearch・WebFetch を読み込んで使ってください。各キーワード・項目は kind "topic"、area は「モジュール名」。どのページで確かめたかは area の最後に（ ）でURLを書く。確かめられなかった推測は入れない。` },
  { key: 'line', prompt: `LINEヤフー マーケティングスキルバッジ（LINE公式アカウント Basic・Advanced）の出題範囲を、公式の公開ページから調べて一覧にしてください。公式ページ https://www.lycbiz.com/jp/support/lineyahoo-marketing-skill-badge/ と、そこからたどれる公式の学習コース（Basic レッスン01〜09、Advanced レッスン01〜07）の、各レッスンで学ぶこと・見出し・用語を使います。ToolSearch で WebSearch・WebFetch を読み込んで使ってください。各キーワード・項目は kind "topic"、area は「Basic 01 LINE公式アカウントのご紹介」のようにコースとレッスン。どのページで確かめたかは area の最後に（ ）でURLを書く。確かめられなかった推測は入れない。` },
]
const results = await parallel(JOBS.map((j) => () => agent(`${j.prompt}\n${COMMON}\n書き出し先：${SYL}/${j.key}.keywords.json`, { phase: '書き出し', label: `書き出し ${j.key}`, schema: SCHEMA, effort: j.key.length > 4 ? 'high' : 'medium' }).then((r) => ({ key: j.key, ...(r || {}) }))))
return results
