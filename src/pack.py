import csv
from tqdm import tqdm
import geohash
from bitarray import bitarray

with open('../preprocess/postcodes.csv') as csvfile:
	csvreader = csv.reader(csvfile)
	header = next(csvreader) # skip header
	rows = list(csvreader)

print(f'Loaded {len(rows):,} postcodes.')

for row in rows:
	if not len(row[3].split('.')[0]) == 1:
		raise ValueError("Error: a longitude does not have 1 digit before decimal!", row)
	if not len(row[4].split('.')[0]) == 2:
		raise ValueError("Error: a latitude does not have 2 digits before decimal!", row)
	if not row[4].startswith('5'):
		raise ValueError("Error: a latitude does not start with '5'!", row)

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
		lat,lon = row[3], row[2]
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

with open('bitmap.bin', 'wb') as file:
	file.write(bitmap_bytes)
with open('coords.bin', 'wb') as file:
	file.write(coords_bytes)

import os
def runcmd(cmd):
	print('\n', cmd)
	os.system(cmd)

runcmd("ls -lsah bitmap.bin")
runcmd("gzip --keep --verbose -9 --force bitmap.bin && ls -lsah bitmap.bin.gz")
runcmd("brotli bitmap.bin --output=bitmap.bin.br --force && ls -lsah bitmap.bin.br")
# runcmd("zstd bitmap.bin -o bitmap.bin.zst --ultra --force && ls -lsah bitmap.bin.zst")

runcmd("ls -lsah coords.bin")
runcmd("gzip --keep --verbose -9 --force coords.bin && ls -lsah coords.bin.gz")
runcmd("brotli coords.bin --output=coords.bin.br --force && ls -lsah coords.bin.br")
# runcmd("zstd coords.bin -o coords.bin.zst --ultra --force && ls -lsah coords.bin.zst")
