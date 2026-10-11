# OpenFreeMap の Liberty スタイル（OpenStreetMap 標準地図に近い見た目）を BITEMAP 用に変換して
# data/map-liberty.json を作る。
#   python3 tools/geo/build_liberty.py <openfreemap-styles>/styles/liberty/style.json data/map-liberty.json
# 元: https://github.com/hyperknot/openfreemap-styles（MIT。Liberty は maputnik/osm-liberty の派生、
#     デザイン CC BY 4.0・コード BSD 3-Clause。地図データ © OpenStreetMap contributors / OpenMapTiles）
# 変更点:
#   - タイル・スプライトの置き場所を tiles.openfreemap.org に固定
#   - OpenFreeMap の文字データ（Noto Sans）には日本語の字形が無いため、文字は国土地理院の
#     日本語フォント（NotoSansCJKjp-Regular）に統一
#   - 地名は「英語＋現地語」の2段表記をやめ、日本語名があれば日本語・無ければ現地名の1段表記
import json, sys
src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src, encoding='utf-8'))
DOMAIN = 'tiles.openfreemap.org'
GLYPHS = 'https://maps.gsi.go.jp/xyz/noto-jp/{fontstack}/{range}.pbf'
FONT = ['NotoSansCJKjp-Regular']
JA_NAME = ['coalesce', ['get', 'name:ja'], ['get', 'name']]

def fix_domain(v):
    if isinstance(v, str): return v.replace('__TILEJSON_DOMAIN__', DOMAIN)
    if isinstance(v, list): return [fix_domain(x) for x in v]
    if isinstance(v, dict): return {k: fix_domain(x) for k, x in v.items()}
    return v

d = fix_domain(d)
d['glyphs'] = GLYPHS
d['name'] = 'BITEMAP Liberty'
n_text = 0
for l in d['layers']:
    lay = l.get('layout') or {}
    if 'text-font' in lay:
        lay['text-font'] = FONT
    tf = lay.get('text-field')
    if tf is not None and 'name:nonlatin' in json.dumps(tf):
        lay['text-field'] = JA_NAME
        n_text += 1
json.dump(d, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('layers', len(d['layers']), 'labels rewritten', n_text, 'sources', list(d['sources']))
