import os

if not os.path.isfile('postcodes.csv'):
	# Generate temp csv file for faster future runs
	input_file = "cbs_pc6_2024_v1.gpkg"
	if not os.path.isfile(input_file):
		raise FileNotFoundError(f'Source file {input_file} does not exist. Please download it.')

	print("Generating temp csv file...")
	print("  --> Importing geopandas")
	import geopandas as gpd

	print(f'  --> Reading {input_file}')
	data = gpd.read_file(input_file, columns=['postcode6', 'geometry'])

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

	output_csv = "postcodes.csv"
	print(f'  --> Writing to {output_csv}')
	csv_output = data_centroids[['postcode6', 'lat', 'lon']]
	csv_output.to_csv(output_csv, index=False)

	print(f"  --> Exported {len(csv_output):,} rows to {output_csv}")

import csv
from tqdm import tqdm
import geohash
from bitarray import bitarray

with open('postcodes.csv') as csvfile:
	csvreader = csv.reader(csvfile)
	header = next(csvreader) # skip header
	rows = list(csvreader)

print(f'Loaded {len(rows):,} postcodes.')

for row in rows:
	if not row[1].startswith('5'):
		raise ValueError("Error: a latitude does not start with '5'!", row)
	if not len(row[1].split('.')[0]) == 2:
		raise ValueError("Error: a latitude does not have 2 digits before decimal!", row)
	if not len(row[2].split('.')[0]) == 1:
		raise ValueError("Error: a longitude does not have 1 digit before decimal!", row)

rows_dict = {item[0]: item[1:] for item in rows}

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
		lat,lon = row[0], row[1]
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

write_bytes('postcodes.pack', bitmap_bytes + coords_bytes)
write_bytes_gzip('postcodes.pack.gz', bitmap_bytes + coords_bytes)
