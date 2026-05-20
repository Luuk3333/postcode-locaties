import os
import csv

header_info = {
	"pack_version": "1",
	"data_country": 'NL',
	"data_date": '2025-03-26',
}

# Possible data sources
CBS_FILE = 'cbs_pc6_2024_v1.gpkg'
CBS_CSV = CBS_FILE + '.csv'

rows = []

if os.path.isfile(CBS_CSV):
	header_info["data_source"] = "CBS"
	print(f'  --> Reading {CBS_CSV}')
	with open(CBS_CSV) as file:
		csvreader = csv.DictReader(file)
		rows = list(csvreader)
elif os.path.isfile(CBS_FILE):
	header_info["data_source"] = "CBS"
	print("  --> Importing geopandas")
	import geopandas as gpd

	print(f'  --> Reading {CBS_FILE}')
	data = gpd.read_file(CBS_FILE, columns=['postcode6', 'geometry'])

	print(data.head(1))
	print("Original CRS:", data.crs) # Expecting EPSG:28992 (Rijksdriehoeksmeting)

	# Calculate center of postcode
	print("  --> Calculating postcode centroids")
	data_centroids = data.copy()
	data_centroids['centroid'] = data_centroids.geometry.centroid

	# Convert to WGS84
	centroids_wgs84 = data_centroids.set_geometry('centroid').to_crs(epsg=4326)
	data_centroids['lat'] = centroids_wgs84.geometry.y
	data_centroids['lon'] = centroids_wgs84.geometry.x

	# Generate temp csv file for faster future runs
	print(f'  --> Writing to {CBS_CSV}')
	csv_output = data_centroids[['postcode6', 'lat', 'lon']]
	csv_output.to_csv(CBS_CSV, index=False)
	print(f"  --> Exported {len(csv_output):,} rows to {CBS_CSV}")

	csv_output.to_dict(orient='records')
else:
	raise FileNotFoundError("Error: No input file found. Please download it. Exiting..")

from tqdm import tqdm
import geohash
from bitarray import bitarray
import struct
import datetime

# Compile header
header_bytes = struct.pack(
	"<4s16s8s8s10s10s8s",
	b"PCPK",
	header_info["pack_version"].encode("ascii").ljust(16, b'\x00'),
	header_info["data_country"].encode("ascii"),
	header_info["data_source"].encode("ascii"),
	header_info["data_date"].encode("ascii"),
	datetime.datetime.now().isoformat()[:10].encode("ascii"),
	b"\x00" * 8,
)

print(f'Loaded {len(rows):,} postcodes.')

for row in rows:
	if not str(row['lat']).startswith('5'):
		raise ValueError("Error: a latitude does not start with '5'!", row)
	if not len(str(row['lat']).split('.')[0]) == 2:
		raise ValueError("Error: a latitude does not have 2 digits before decimal!", row)
	if not len(str(row['lon']).split('.')[0]) == 1:
		raise ValueError("Error: a longitude does not have 1 digit before decimal!", row)

rows_dict = {
    row['postcode6']: {
        'lat': row['lat'],
        'lon': row['lon']
    }
    for row in rows
}

ALPHABET = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']
postcodes = []

for a in range(1, 9+1):
	for b in range(0, 9+1):
		for c in range(0, 9+1):
			for d in range(0, 9+1):
				for e in range(0, 26):
					for f in range(0, 26):
						postcode = f'{a}{b}{c}{d}{ALPHABET[e]}{ALPHABET[f]}'
						postcodes.append(postcode)
print(f'Generated {len(postcodes):,} postcodes ({postcodes[0]} through {postcodes[-1]}).')

bitcount = 0
bits = 0
bit_index = 0
bitmap_bytes = bytearray()
coords_bytes = bytearray()

def check_valid_postcode(postcode):
	return postcode in rows_dict.keys()

for postcode in postcodes:
	if check_valid_postcode(postcode):
		bits |= (1 << (7 - bit_index))

		# Add the 4-char string for valid postcode
		row = rows_dict.get(postcode)
		lat, lon = row['lat'], row['lon']
		hash = geohash.encode(float(lat), float(lon), precision=6)[2:]
		coords_bytes.extend(hash.encode('ascii'))

	bit_index += 1
	bitcount += 1

	if bit_index == 8:
		bitmap_bytes.append(bits)
		bits = 0
		bit_index = 0

# Add remaining bits
if bit_index > 0:
	bitmap_bytes.append(bits)

# Compress and write binaries
import gzip
def write_bytes(filename, data_bytes):
    with open(filename, 'wb') as file:
        file.write(data_bytes)

def write_bytes_gzip(filename, data_bytes):
    compressed = gzip.compress(data_bytes, compresslevel=9)
    write_bytes(filename, compressed)

all_bytes = header_bytes + bitmap_bytes + coords_bytes
write_bytes('postcodes.pack', all_bytes)
write_bytes_gzip('postcodes.pack.gz', all_bytes)
