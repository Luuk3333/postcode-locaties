# postcode-locaties
Get lat/lon coordinates of Dutch postcodes completely client-side without API requests.

## How to use
### 1. Packing binary
The script [`src/pack.py`](src/pack.py) reads a GeoPackage (GPKG) file from CBS and packs the location data into a binary file. It creates an intermediate `postcodes.csv` file for faster runs.

#### 1.1 Source data
CBS provides postcode data in a GeoPackage (GPKG) file which includes polygons of each postcode. This script reads this data, calculates polygon centroids and outputs an intermediate `postcodes.csv` file.

If you want to bring your own postcode data: place it in `postcodes.csv` in the following format and this script will use that instead of CBS data:
```csv
postcode6,lat,lon
1034XZ,52.40376675629908,4.907777651195642
1058EH,52.36149008188852,4.844611782197562
1082MD,52.33777631760533,4.87075088206934
...
```

Otherwise:
1. Download the most recent `volledige postcode (PC6)` from CBS available on this page: https://www.cbs.nl/nl-nl/dossier/nederland-regionaal/geografische-data/gegevens-per-postcode.
2. Unzip and place `cbs_pc6_2024_v1.gpkg` (or a more recent year) in the same folder as `pack.py`.
3. Set `input_file` in [`src/pack.py`](src/pack.py) to match the filename.


#### 1.2 Generating binary
1. Set up virtual env. Install packages with `pip install -r requirements.txt`.
2. Run `python pack.py`. The binary data will be stored as a `.pack` file and compressed as a `.pack.gz` file.

### 2. Installation
1. Include postcode-locaties.js:
```html
<script src="postcode-locaties.js"></script>
```

2. Fetch binaries and initialize:
```javascript
let pcloc;
window.onload = async function() {
    pcloc = await PostcodeLocaties({
		packUrl: 'https://example.com/postcodes.pack',
		packGzUrl: 'https://example.com/postcodes.pack.gz',
    });
};
```

### 3. Example
```javascript
console.log(pcloc.lookup('1398PX'));
```

```
{
    geohash: "u179gk",
    lat: 52.36358642578125,
    lon: 5.0701904296875
}
```
