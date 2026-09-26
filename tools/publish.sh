#!/bin/sh
# データを組み立てて、チェックして、GitHub に公開する
set -e
cd "$(dirname "$0")/.."
if [ -f tools/journals.txt ]; then
  python3 tools/build_data.py $(cat tools/journals.txt)
fi
python3 tools/check_data.py
python3 tools/check_private.py
python3 tools/gen_sw.py
git add -A
git commit -q -m "${1:-更新}" || echo "変更なし"
git push -q
echo "公開しました"
