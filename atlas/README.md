# Atlas of Empires

An interactive world map of empires and peoples from 4000 BC to the present. Drag the timeline (or press play) to watch borders shift. Click a region, empire bar, city or event marker for details with written sources and archaeology. Select an empire to see who was ruling in any given year.

## Following a history podcast

Dates use BC and AD ("1274 BC", "AD 476"). Search for the empire, then click **Zoom timeline to its lifespan**. Use the region menu to cut the timeline down to that part of the world. Step year by year with the arrow keys as the episodes move forward. The line under the big year names whoever was ruling. Click a reign in the strip above the empire bars to jump to its start.

For *The History of Byzantium* (which starts in 476), this link sets everything up:

```
/?y=476&p=byzantine&r=europe&z0=0.515&z1=0.745
```

Built with Vite, React and a canvas map renderer (d3-geo). It deploys to Vercel as a static site, with no server or database.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173
```

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel, click **Add New → Project** and import the repository.
3. Vercel detects Vite automatically. The settings are: build command `npm run build`, output directory `dist`.
4. Deploy. After that, every push to `main` redeploys the site within a minute or so.

To use it under your own domain or as a section of an existing site, add the domain in the Vercel project settings, or embed it with an `<iframe>`. The URL carries the state, for example `/?y=-1274&p=hittites` or `/?e=kadesh`, so links to a particular moment can be shared.

## Updating the content

All content lives in four JSON files in `src/data/`. Edit, commit and push; the build checks the data first (`npm run check-data`) and refuses to deploy if something is malformed. It tells you which entry and field is wrong.

### Add or edit an empire profile: `src/data/polities.json`

```json
{
  "id": "hittites",                 // unique, lowercase, used in URLs and event links
  "name": "Hittite Kingdom",
  "start": -1650, "end": -1180,     // negative = BC; there is no year 0
  "peak": -1300,                    // optional; "Go to height" and search jump here
  "color": "#8E9A4A",               // map and timeline colour
  "match": ["Hittites"],            // region names in the border data this profile covers
  "regions": ["mideast"],           // europe, mideast, africa, steppe, southasia, eastasia, americas
  "capital": "Hattusa",
  "summary": "Two or three plain sentences.",
  "sources": [
    { "kind": "primary", "cite": "Proclamation of Telipinu (CTH 19)", "note": "optional" },
    { "kind": "archaeology", "cite": "German excavations at Hattusa from 1906" }
  ],
  "sites": [{ "name": "Hattusa", "lat": 40.02, "lon": 34.62 }]
}
```

`kind` is `eyewitness` (written by someone who was there), `primary` (ancient texts, inscriptions, archives), `archaeology`, or `scholarship` (modern historians).

`match` links a profile to map regions. A region is linked only while the year is inside the profile's `start`–`end`. To find the exact region names the dataset uses, click the region on the map; the panel shows its name.

### Add an event: `src/data/events.json`

```json
{
  "id": "kadesh", "year": -1274, "approx": true,
  "type": "battle",                 // battle | founding | collapse | treaty | milestone
  "title": "Battle of Kadesh",
  "lat": 34.56, "lon": 36.52,
  "polities": ["egypt", "hittites"],
  "summary": "One or two sentences.",
  "sources": [{ "kind": "primary", "cite": "Kadesh inscriptions at Abu Simbel, Karnak and Luxor" }]
}
```

`approx: true` displays the date as "c. 1274 BC".

### Rulers: `src/data/rulers.json`

Keyed by profile `id`. Overlapping reigns (co-emperors, rival claimants) are allowed and are shown together.

```json
"byzantine": { "title": "Emperor", "list": [
  { "name": "Justinian I", "start": 527, "end": 565 }
]}
```

### Cities: `src/data/cities.json`

Cities appear only while they exist, under the name they had at the time. `rank` 1 shows at world zoom, 2 when zoomed in a little, 3 when zoomed in further. Each name applies up to and including its `until` year; leave `until` as `null` on the last name.

```json
{ "id": "constantinople", "lat": 41.01, "lon": 28.98, "rank": 1, "from": -657, "to": null,
  "names": [{ "name": "Byzantion", "until": 329 }, { "name": "Constantinople", "until": 1453 }, { "name": "Istanbul", "until": null }] }
```

## How the map works

Coastlines, rivers and lakes come from Natural Earth (`public/data/base/`). Sharper coastlines load once you zoom in. Polity colours are trimmed to the modern shoreline, so ancient coasts that have since moved (the head of the Persian Gulf, silted harbours such as Ephesus) are not shown.

## Detailed overlays

Where better border data exists, it replaces the general map for those years. The overlays live in `public/data/overlays/` as GeoJSON, listed in `index.json`:

- `us.json`: every U.S. state and territory boundary from 3 September 1783 to 2000, accurate to the day, from the Newberry Library's *Atlas of Historical County Boundaries*. Clicking one shows the legal change and its citation.
- `ancient.json`: Rome (60 BC, AD 117, AD 200), the Persian Empire, Alexander's empire, and the Hasmonean and Herodian kingdoms, from the Ancient World Mapping Center (after the *Barrington Atlas*). It also holds the Iron Age Bible-lands kingdoms (Israel, Judah, Philistia, Moab, Ammon, Edom, Aram, Phoenicia, Yehud), which are hand-drawn from biblical boundary descriptions and excavated sites and marked approximate.
- `roman-lines.json` and `roman-roads.json`: Roman provincial boundaries and roads (shown when zoomed in).

Each feature's `properties` has `name`, `start`, `end` (BC years negative), `kind` (`area`, `claim`, `lines` or `roads`), an optional `polity` id, `desc`, `sources` and `precision` (1 approximate, 2 scholarly atlas, 3 surveyed or legal). An `area` overlay hides that polity's shape from the general map while it is active. You can draw new ones in a tool like geojson.io and add them; the build checks them.

The AWMC data is under the Open Database License, so keep `public/data/overlays/SOURCES.md` with it.

## How the borders work

The outlines come from [historical-basemaps](https://github.com/aourednik/historical-basemaps), which records the world at 50 dates. They are simplified to about 8 MB of TopoJSON in `public/data/borders/` and loaded on demand. Between two recorded dates the map cross-fades from one snapshot to the next. In-between years are therefore approximations, and the interface says so: the dots on the timeline axis mark the real snapshots.

Before about 1000 BC most shapes mark the reach of a culture rather than a frontier. Each region carries a precision rating that is shown when you click it. Some labels in the dataset are idiosyncratic. For example, Shang China is labelled "Sinic", and "Hittites" persists to 700 BC for the Neo-Hittite states. Profiles explain these cases where they matter.

To pull in upstream corrections:

```bash
npm i -g mapshaper
npm run build-borders
```

## Licensing

The border data is GPL-3.0 (see `public/data/borders/LICENSE.md`) and must stay under that licence with attribution, which the site's About panel provides. Your own code and the profile and event text can carry whatever licence you choose. Because the GPL data is distributed with the site, the simplest course is to keep the repository public, or at least the data files. This is a practical note, not legal advice.
