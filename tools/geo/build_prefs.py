# 都道府県の簡略ポリゴン → SVG パス（制覇マップ用）。沖縄は日本海の左上へ移す（よくある日本地図の配置）
import json, math, sys
src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src, encoding='utf-8'))
K = math.cos(math.radians(36.5))   # 経度の縮み
S = 52.0                           # 1度あたりの px
LON0, LAT1 = 128.0, 46.0           # 左上
def proj(lon, lat, code):
    if code == '47':                       # 沖縄: 右上へ移動して枠の中に
        lon, lat = lon + 6.6, lat + 14.2
    return ((lon - LON0) * K * S, (LAT1 - lat) * S)
prefs = []
allx, ally = [], []
for f in d['features']:
    code = str(f.get('id') or f['properties'].get('id') or '').zfill(2)
    name = f['properties']['name']
    g = f['geometry']
    polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    parts = []
    for poly in polys:
        ring = poly[0]
        lons = [p[0] for p in ring]; lats = [p[1] for p in ring]
        cx, cy = sum(lons) / len(lons), sum(lats) / len(lats)
        if code == '13' and cy < 32.5: continue          # 小笠原など遠い島は省く
        if code == '47' and cx > 130.0: continue         # 大東諸島は省く
        if code == '46' and cy < 29.6: continue          # 奄美以南は省く（縦長を抑える。県の色は本土側で分かる）
        pts = [proj(lo, la, code) for lo, la in ring]
        # 同じ点の連続を省く（0.1px単位）
        seq = []
        for x, y in pts:
            q = (round(x, 1), round(y, 1))
            if not seq or seq[-1] != q: seq.append(q)
        if len(seq) < 3: continue
        allx += [p[0] for p in seq]; ally += [p[1] for p in seq]
        parts.append('M' + 'L'.join(f'{x:g},{y:g}' for x, y in seq) + 'Z')
    prefs.append({'code': code, 'name': name, 'd': ''.join(parts)})
minx, miny, maxx, maxy = min(allx), min(ally), max(allx), max(ally)
pad = 6
# 原点を左上へ寄せる
def shift(dstr):
    import re
    def rep(m):
        x = float(m.group(1)) - minx + pad; y = float(m.group(2)) - miny + pad
        return f'{round(x,1):g},{round(y,1):g}'
    return re.sub(r'(-?[\d.]+),(-?[\d.]+)', rep, dstr)
for p in prefs: p['d'] = shift(p['d'])
W, H = round(maxx - minx + pad * 2), round(maxy - miny + pad * 2)
# 沖縄の枠（移動したことを示す）
ok = [p for p in prefs if p['code'] == '47'][0]
import re
nums = [tuple(map(float, m)) for m in re.findall(r'(-?[\d.]+),(-?[\d.]+)', ok['d'])]
ox0, oy0 = min(n[0] for n in nums) - 6, min(n[1] for n in nums) - 6
ox1, oy1 = max(n[0] for n in nums) + 6, max(n[1] for n in nums) + 6
prefs.sort(key=lambda p: p['code'])
# 各県の代表点（輪郭の点の平均。海沿いの店が簡略化した輪郭の外に出たときの最寄り判定用）
for p in prefs:
    nums2 = [tuple(map(float, m)) for m in re.findall(r'(-?[\d.]+),(-?[\d.]+)', p['d'])]
    p['c'] = [round(sum(n[0] for n in nums2) / len(nums2), 1), round(sum(n[1] for n in nums2) / len(nums2), 1)]
res = {
    'attribution': '国土交通省 国土数値情報「行政区域データ 2025年版」（CC BY 4.0）を japan-choropleth（共同通信社）経由で加工',
    'attributionUrl': 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2025.html',
    'viewBox': [0, 0, W, H],
    'okinawaBox': [round(ox0, 1), round(oy0, 1), round(ox1 - ox0, 1), round(oy1 - oy0, 1)],
    # 緯度経度 → この図の座標: x = (lon - lon0) * k * s + dx, y = (lat1 - lat) * s + dy
    # 沖縄（lat < 28 かつ lon < 131）は先に lon += okinawa[0], lat += okinawa[1] してから変換する
    'proj': {'lon0': LON0, 'lat1': LAT1, 'k': round(K, 6), 's': S, 'dx': round(-minx + pad, 2), 'dy': round(-miny + pad, 2), 'okinawa': [6.6, 14.2]},
    'prefs': prefs,
}
json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('W,H', W, H, 'n', len(prefs), 'okbox', res['okinawaBox'])
