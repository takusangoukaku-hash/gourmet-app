import json, collections
from shapely.geometry import shape, box, mapping, Point, LineString
from shapely.ops import unary_union
from shapely.validation import make_valid
K='/tmp/claude-0/-home-user-gourmet-app/8edbdaa3-b81a-5c49-b452-bda755b7f07f/scratchpad/mapkit/node_modules/'
BBOX=box(122.0, 23.5, 149.0, 46.5)  # 日本全域
out={}
def fc(feats): return {'type':'FeatureCollection','features':feats}
def feat(geom, props): return {'type':'Feature','geometry':mapping(geom),'properties':props}
# --- water: 海 = 範囲 − 日本の陸地 ---
c=json.load(open(K+'@geo-maps/countries-coastline-1km/map.geo.json'))
parts=[make_valid(shape(f['geometry'])).intersection(BBOX) for f in c['features'] if f['properties'].get('A3')=='JPN']
land=unary_union([g for g in parts if not g.is_empty]).buffer(0)
ocean=BBOX.difference(land)
from shapely import set_precision
ocean=set_precision(ocean.simplify(0.0008, preserve_topology=True), 0.0001)
out['water']=fc([feat(ocean, {'class':'ocean'})])
# --- boundary / place: 市区町村 ---
m=json.load(open(K+'japan-choropleth/data/geojson/municipalities.geojson'))
bfeats=[]; pfeats=[]
for f in m['features']:
    g=shape(f['geometry'])
    if not g.intersects(BBOX): continue
    p=f['properties']; name=p.get('displayName') or p.get('municipality') or ''
    gs=g.simplify(0.0012, preserve_topology=True)
    for poly in (gs.geoms if gs.geom_type=='MultiPolygon' else [gs]):
        if poly.is_empty or poly.geom_type!='Polygon' or poly.area < 2e-5: continue  # 小島・飛び地は省く
        coords=[(round(x,4),round(y,4)) for x,y in poly.exterior.coords]
        if len(coords) < 4: continue
        bfeats.append(feat(LineString(coords), {'admin_level':4}))
    rp=g.representative_point()
    cls='town'
    pfeats.append(feat(rp, {'class':cls, 'name':name, 'name:ja':name, 'rank':10}))
cities=[('東京',139.7671,35.6812),('横浜',139.6380,35.4437),('千葉',140.1063,35.6074),('さいたま',139.6489,35.8617),('川崎',139.7029,35.5309),('八王子',139.3160,35.6664),('大阪',135.5023,34.6937),('京都',135.7681,35.0116),('名古屋',136.9066,35.1815),('神戸',135.1955,34.6901),('福岡',130.4017,33.5902),('札幌',141.3545,43.0621),('仙台',140.8694,38.2682),('広島',132.4553,34.3853),('金沢',136.6562,36.5613),('静岡',138.3828,34.9756),('新潟',139.0364,37.9162),('那覇',127.6809,26.2124)]
for n,lon,lat in cities: pfeats.append(feat(Point(lon,lat), {'class':'city','name':n,'name:ja':n,'rank':1}))
pref=json.load(open(K+'japan-choropleth/data/geojson/prefectures.geojson'))
for f in pref['features']:
    g=shape(f['geometry']).simplify(0.0012, preserve_topology=True)
    for poly in (g.geoms if g.geom_type=='MultiPolygon' else [g]):
        if poly.is_empty or poly.geom_type!='Polygon' or poly.area < 2e-5: continue
        coords=[(round(x,4),round(y,4)) for x,y in poly.exterior.coords]
        bfeats.append(feat(LineString(coords), {'admin_level':2}))
out['boundary']=fc(bfeats); out['place']=fc(pfeats)
# --- rail ---
r=json.load(open(K+'@worldwideview/wwv-plugin-osm-rail-network/data/data.json'))
rfeats=[]
for f in r['features']:
    try: g=shape(f['geometry'])
    except Exception: continue
    if not g.intersects(BBOX): continue
    gi=g.intersection(BBOX)
    rfeats.append(feat(gi, {'class':'rail','subclass':'rail'}))
out['transportation']=fc(rfeats)
print('rail props sample', r['features'][0]['properties'] if r['features'] else None, 'rail feats in bbox', len(rfeats))
# --- poi: 駅（店舗データの station から位置を推定） ---
d=json.load(open('/root/data/backup_full.json'))
st=collections.defaultdict(list)
for s in d['shops']:
    if s.get('station') and s.get('lat') and s.get('lon'): st[s['station']].append((s['lon'],s['lat']))
poi=[]
for name,pts in st.items():
    if len(pts)<2: continue
    lon=sum(p[0] for p in pts)/len(pts); lat=sum(p[1] for p in pts)/len(pts)
    poi.append(feat(Point(lon,lat), {'class':'railway','subclass':'station','name':name,'name:ja':name,'rank':5}))
out['poi']=fc(poi)
json.dump(out, open('/tmp/claude-0/-home-user-gourmet-app/8edbdaa3-b81a-5c49-b452-bda755b7f07f/scratchpad/site/basemap.json','w'))
import os
print({k:len(v['features']) for k,v in out.items()}, 'size MB', round(os.path.getsize('/tmp/claude-0/-home-user-gourmet-app/8edbdaa3-b81a-5c49-b452-bda755b7f07f/scratchpad/site/basemap.json')/1e6,1))
