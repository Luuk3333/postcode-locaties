import geopandas as gpd
import pandas as pd

input_file = "cbs_pc6_2024_v1.gpkg"
data = gpd.read_file(input_file, columns=['postcode6', 'geometry'])

print(data.head(1))
print("\nOriginal CRS:", data.crs) # Expecting EPSG:28992 (Rijksdriehoeksmeting)

# Calculate center of postcode
data_centroids = data.copy()
data_centroids['centroid'] = data_centroids.geometry.centroid
data_centroids['x_rd'] = data_centroids['centroid'].x
data_centroids['y_rd'] = data_centroids['centroid'].y

# Also output in WGS84
centroids_wgs84 = data_centroids.set_geometry('centroid').to_crs(epsg=4326)
data_centroids['lon'] = centroids_wgs84.geometry.x
data_centroids['lat'] = centroids_wgs84.geometry.y

csv_output = data_centroids[['postcode6', 'x_rd', 'y_rd', 'lon', 'lat']]
output_csv = "postcodes.csv"
csv_output.to_csv(output_csv, index=False)

print(f"\nExported {len(csv_output)} rows to {output_csv}")
