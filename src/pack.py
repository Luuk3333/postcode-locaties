import csv
from tqdm import tqdm
import gzip
import shutil

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

for a in range(0, 9+1):
	for b in range(0, 9+1):
		for c in range(0, 9+1):
			for d in range(0, 9+1):
				for e in range(0, 26):
					for f in range(0, 26):
						postcode = f'{a}{b}{c}{d}{ALPHABET[e]}{ALPHABET[f]}'
						postcodes.append(postcode)
print(f'Generated {len(postcodes):,} postcodes.')

start = None
lines = [''] * len(postcodes)

i = 0
for postcode in tqdm(postcodes):
	row = rows_dict.get(postcode)
	if row is not None:
		if start is None:
			start = postcode
		lines[i] = row[2][0:5].replace('.', '') # 4.12345 --> 4123
		lines[i] += row[3][1:6].replace('.', '') # 52.67891 --> 2678
	i += 1

# remove trailing non-existing postcodes
while lines and lines[-1] == "":
	lines.pop()

with open("pack.txt", "w") as file:
	for line in lines:
		if len(line) > 0:
			file.write(line + '\n')
		else:
			file.write('\n')

import os
def runcmd(cmd):
	print('\n', cmd)
	os.system(cmd)

runcmd("ls -lsah pack.txt")
runcmd("gzip --keep --verbose -9 --force pack.txt && ls -lsah pack.txt.gz")
# runcmd("brotli pack.txt --output=pack.txt.br --force && ls -lsah pack.txt.br")
# runcmd("zstd pack.txt -o pack.txt.zst --ultra --force && ls -lsah pack.txt.zst")
