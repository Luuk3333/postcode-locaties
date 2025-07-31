# export-csv.py
The script [`export-csv.py`](export-csv.py) reads the GeoPackage (GPKG) file from CBS and outputs a csv file for easier use.

## Steps to use
1. Download the most recent `volledige postcode (PC6)` from CBS available on this page: https://www.cbs.nl/nl-nl/dossier/nederland-regionaal/geografische-data/gegevens-per-postcode.
2. Unzip and place `cbs_pc6_2024_v1.gpkg` (or a more recent year) in the same folder as `export-csv.py`.
3. Set up virtual env. Install packages with `pip install -r requirements.txt`.
3. Set `input_file` in [`export-csv.py`](export-csv.py).
4. Run `python export-csv.py`.
