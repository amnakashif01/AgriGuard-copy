#!/usr/bin/env python3
"""Build the free Pakistan supplier snapshot from an official Geofabrik extract.

Install: python -m pip install osmium==4.3.1
Download the dated .osm.pbf and matching .md5 from
https://download.geofabrik.de/asia/pakistan.html and verify with md5sum -c.
Usage: python scripts/refresh-marketplace-directory.py PATH.osm.pbf --date YYYY-MM-DD
OSM data is ODbL-1.0; retain source/date/license metadata and attribution.
The extract is a map directory, not proof of current stock or opening status.
"""
import argparse
import hashlib
import json
import math
import re
from pathlib import Path

import osmium

SHOPS = {'agrarian', 'agriculture', 'agro', 'agricultural_supplies',
         'agricultural_machinery', 'seed', 'seeds', 'garden_centre',
         'garden_machinery', 'tractor'}
BUSINESS = re.compile(r'\b(?:seeds?|fertili[sz]ers?|pesticides?|fungicides?|agro|agricultural|nurser(?:y|ies)|irrigation|tractors?)\b|زرعی|کھاد|بیج|نرسری', re.I)
EXCLUDE = re.compile(r'\b(?:school|college|university|kindergarten|preschool|pre nursery|guest house|rest house|hostel|mosque|sewing|contractors?|research|department|deptt|park|colony)\b', re.I)
UNRELATED = re.compile(r'\b(?:poultry|dairy|honey|beekeep|goat|cattle|cow|livestock|aviary|takaful|insurance|property|frame shop|block workes|fliberglass|reservoir|irrigation office|agricultural (?:area|land)|agro (?:oil|foods|processors))\b|حویلی|زرعی کھیت', re.I)
KEEP = {'name', 'name:en', 'shop', 'landuse', 'trade', 'craft', 'amenity', 'office',
        'product', 'produce', 'crop', 'agricultural:products', 'agrarian', 'shop:agrarian',
        'addr:full', 'addr:street', 'addr:city', 'addr:state', 'phone', 'mobile',
        'contact:phone', 'contact:whatsapp', 'disused', 'abandoned', 'demolished', 'closed'}


def business_tags(obj):
    t = dict(obj.tags)
    name = t.get('name') or t.get('name:en', '')
    typed = t.get('shop') in SHOPS or t.get('landuse') == 'plant_nursery'
    if not typed and not BUSINESS.search(name):
        return None
    if any(t.get(k) for k in ('highway', 'railway', 'waterway', 'boundary', 'tourism')):
        return None
    if t.get('place') not in (None, 'farm') or t.get('office') in ('government', 'research', 'educational_institution', 'construction_company'):
        return None
    if t.get('amenity') not in (None, 'marketplace') or EXCLUDE.search(name) or UNRELATED.search(name):
        return None
    if t.get('historic') or t.get('natural') == 'water' or t.get('leisure') in ('pitch', 'playground', 'sports_centre'):
        return None
    if not typed and t.get('landuse') in ('residential', 'grass'):
        return None
    if not typed and t.get('landuse') in ('farmland', 'farmyard', 'meadow') and not re.search(r'nurser|نرسری', name, re.I):
        return None
    if any(t.get(k) == 'yes' or t.get(k + ':shop') for k in ('disused', 'abandoned', 'demolished', 'closed')):
        return None
    if t.get('shop') in ('vacant', 'no', 'closed', 'motorcycle_repair'):
        return None
    if not name:
        name = 'Mapped plant nursery' if t.get('landuse') == 'plant_nursery' else 'Mapped agricultural shop'
    # Generic labels explicitly describe an unnamed mapped feature, not a business name.
    t['name'] = name
    return {k: v for k, v in t.items() if k in KEEP}


def distance(a, b):
    a, b = a.get('center', a), b.get('center', b)
    lat1, lat2 = math.radians(a['lat']), math.radians(b['lat'])
    dlat, dlon = lat2 - lat1, math.radians(b['lon'] - a['lon'])
    return 12742 * math.asin(math.sqrt(math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2))


def name_key(name):
    name = name.lower().replace('fertilizers', 'fertilizer')
    name = re.sub(r'\b(?:plants?|ltd|limited)\b', '', name)
    return re.sub(r'\W+', '', name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pbf', type=Path)
    parser.add_argument('--date', required=True)
    parser.add_argument('--output', type=Path, default=Path('src/lib/pakistan-suppliers.json'))
    args = parser.parse_args()
    records = []
    # Filter in libosmium before entering Python; still index node locations for ways.
    objects = osmium.FileProcessor(args.pbf).with_locations().with_filter(osmium.filter.KeyFilter('name', 'name:en', 'shop', 'landuse', 'trade'))
    for obj in objects:
        tags = business_tags(obj)
        if tags is None:
            continue
        if isinstance(obj, osmium.osm.Node) and obj.location.valid():
            entry = {'type': 'node', 'id': obj.id, 'lat': obj.location.lat, 'lon': obj.location.lon, 'tags': tags}
        elif isinstance(obj, osmium.osm.Way):
            points = [(n.lat, n.lon) for n in obj.nodes if n.location.valid()]
            if not points:
                continue
            entry = {'type': 'way', 'id': obj.id, 'center': {'lat': (min(p[0] for p in points) + max(p[0] for p in points)) / 2, 'lon': (min(p[1] for p in points) + max(p[1] for p in points)) / 2}, 'tags': tags}
        else:
            continue
        # A shop node and its surrounding nursery polygon are often the same place.
        if any(name_key(e['tags']['name']) == name_key(tags['name']) and distance(e, entry) < 0.15 for e in records):
            continue
        records.append(entry)
    snapshot = {
        'updatedAt': args.date, 'source': 'OpenStreetMap contributors / Geofabrik',
        'sourceUrl': f'https://download.geofabrik.de/asia/{args.pbf.name}',
        'sourceSha256': hashlib.sha256(args.pbf.read_bytes()).hexdigest(),
        'license': 'ODbL-1.0', 'licenseUrl': 'https://www.openstreetmap.org/copyright',
        'elements': records,
    }
    args.output.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n')
    print(f'{len(records)} mapped agricultural listings written to {args.output}')


if __name__ == '__main__':
    main()
