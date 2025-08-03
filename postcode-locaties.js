async function PostcodeLocaties(options = {}) {
	const {
		packUrl = 'postcodes.pack',
		packGzUrl = 'postcodes.pack.gz',
		lookupHistorySize = 10,
		debug = false,
	} = options;

	const isGzipSupported = typeof DecompressionStream === "function";

	const bitmapLength = 6084000/8; // 1000AA = 9*10*10*10*26*26 bits
	let packBytes = null; // all bytes in pack (bitmap + coords)
	let bitmapBits = null; // extracted bits of bitmap

	async function decompressGzip(arrayBuffer) {
		const ds = new DecompressionStream("gzip");
		const decompressedStream = new Response(
			new Blob([arrayBuffer]).stream().pipeThrough(ds)
		);
		return await decompressedStream.arrayBuffer();
	}

	async function fetchBinary(url, isGzip) {
		const response = await fetch(url);
		const buffer = await response.arrayBuffer();
		const data = isGzip ? await decompressGzip(buffer) : buffer;
		return new Uint8Array(data);
	}

	async function fetchBinaries() {
		if (isGzipSupported) {
			packBytes = await fetchBinary(packGzUrl, true);
		}
		else {
			packBytes = await fetchBinary(packUrl, false);
		}

		bitmapBits = [];
		for (const byte of packBytes.slice(0, bitmapLength)) {
			for (let bit = 7; bit >= 0; bit--) {
				bitmapBits.push((byte >> bit) & 1);
			}
		}
	}

	const offset_valid_count = {
		'1000s': 0, // 1000AA - 1999ZZ
		'2000s': 0, // 2000AA - 2999ZZ
		'3000s': 0,
		'4000s': 0,
		'5000s': 0,
		'6000s': 0,
		'7000s': 0,
		'8000s': 0,
	};

	var pcloc = Object();

	if (debug) {
		pcloc.debug = {
			counting_ms: null,
			lookup_ms: null,
		};
	}

	try {
		await fetchBinaries();

		let start_ms = 0;
		if (debug) start_ms = performance.now();
		for (let index = 0; index < 676000; index++) {
			if (bitmapBits[index + 0*676000]) offset_valid_count['1000s']++;
			if (bitmapBits[index + 1*676000]) offset_valid_count['2000s']++;
			if (bitmapBits[index + 2*676000]) offset_valid_count['3000s']++;
			if (bitmapBits[index + 3*676000]) offset_valid_count['4000s']++;
			if (bitmapBits[index + 4*676000]) offset_valid_count['5000s']++;
			if (bitmapBits[index + 5*676000]) offset_valid_count['6000s']++;
			if (bitmapBits[index + 6*676000]) offset_valid_count['7000s']++;
			if (bitmapBits[index + 7*676000]) offset_valid_count['8000s']++;
		}
		if (debug) {
			pcloc.debug.counting_ms = performance.now() - start_ms;
			console.log(`Counting valid postcodes took ${pcloc.debug.counting_ms} ms.`);
		}
	} catch (err) {
		console.error("Failed to initialize PostcodeLocaties.", err);
		throw err;
	}

	function postcodeToIndex(postcode) {
		const digits = parseInt(postcode.toUpperCase().slice(0, 4), 10);
		const firstLetter = postcode[4];
		const secondLetter = postcode[5];

		function letterToIndex(char) {
			return char.charCodeAt(0) - 'A'.charCodeAt(0);
		}
		const firstLetterIndex = letterToIndex(firstLetter);
		const secondLetterIndex = letterToIndex(secondLetter);

		const lettersIndex = firstLetterIndex * 26 + secondLetterIndex;
		const index = (digits - 1000) * 676 + lettersIndex;

		return index;
	}

	function postcodeToGeohash(postcode) {
		// Skip postcodes lower than 1000AA like 0123AB
		if (postcode[0] === '0') {
			return null;
		}

		// TODO: accommodate PC4 input

		// Sum count of prior valid postcodes
		const offset_digit = parseInt(postcode[0], 10);
		let offset_validsum = 0;
		let offset_index = (offset_digit - 1) * 676000;
		for (let i = 1; i < offset_digit; i++) {
			const key = `${i}000s`;
			offset_validsum += offset_valid_count[key] || 0;
		}

		const index = postcodeToIndex(postcode);
		let coords_index = 0;

		// Count postcodes with coordinate in current thousand block
		for (let i = offset_index; i < index; i++) {
			if (bitmapBits[i] === 1) coords_index++;
		}

		const bit = bitmapBits[index];
		if (debug) console.log({bitmap_index: index, postcode: postcode, value: bit, coords_index: bit ? (offset_validsum + coords_index) : null});
		if (!bit) {
			return null;
		}
		const char0 = packBytes[bitmapLength + (offset_validsum + coords_index)*4 + 0]
		const char1 = packBytes[bitmapLength + (offset_validsum + coords_index)*4 + 1]
		const char2 = packBytes[bitmapLength + (offset_validsum + coords_index)*4 + 2]
		const char3 = packBytes[bitmapLength + (offset_validsum + coords_index)*4 + 3]
		return 'u1' + String.fromCharCode(char0, char1, char2, char3);
	}

	/**
	 * geohash.js
	 * Geohash library for Javascript
	 * (c) 2008 David Troy
	 * Distributed under the MIT License
	 * 
	 * This file includes the functions refine_interval() and decodeGeoHash() from geohash.js.
	 * Retrieved from https://github.com/davetroy/geohash-js/blob/master/geohash.js on 2025-08-02.
	 */
	const BITS = [16, 8, 4, 2, 1];
	const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
	function refine_interval(interval, cd, mask) {
		if (cd&mask)
			interval[0] = (interval[0] + interval[1])/2;
		else
			interval[1] = (interval[0] + interval[1])/2;
	}
	function decodeGeoHash(geohash) {
		var is_even = 1;
		var lat = []; var lon = [];
		lat[0] = -90.0;  lat[1] = 90.0;
		lon[0] = -180.0; lon[1] = 180.0;
		lat_err = 90.0;  lon_err = 180.0;

		for (i=0; i<geohash.length; i++) {
			c = geohash[i];
			cd = BASE32.indexOf(c);
			for (j=0; j<5; j++) {
				mask = BITS[j];
				if (is_even) {
					lon_err /= 2;
					refine_interval(lon, cd, mask);
				} else {
					lat_err /= 2;
					refine_interval(lat, cd, mask);
				}
				is_even = !is_even;
			}
		}
		lat[2] = (lat[0] + lat[1])/2;
		lon[2] = (lon[0] + lon[1])/2;

		return { latitude: lat, longitude: lon};
	}

	function geohashToLatLon(geohash) {
		const result = decodeGeoHash(geohash);
		// {
		//     latitude:  [minLat, maxLat, centerLat],
		//     longitude: [minLon, maxLon, centerLon],
		// }
		return [result.latitude[2], result.longitude[2]];
	}

	class LookupHistory {
		constructor(maxSize) {
			this.maxSize = maxSize;
			this.keys = [];
			this.values = [];
		}

		add(postcode, item) {
			if (this.maxSize <= 0) return;
			this.keys.push(postcode);
			this.values.push(item);

			if (this.keys.length > this.maxSize) {
				// remove oldest item
				this.keys.shift();
				this.values.shift();
			}
		}

		get(postcode) {
			if (this.maxSize <= 0) return null;
			const index = this.keys.indexOf(postcode);
			if (index !== -1) {
				return {value: this.values[index]};
			}
			return null;
		}
	}

	pcloc.lookupHistory = new LookupHistory(lookupHistorySize);

	pcloc.lookup = ((postcode) => {
		let start_ms = 0;
		if (debug) start_ms = performance.now();

		// Return geohash from history if available (can permit to calculate lat/long everytime because geohashToLatLon() is fast)
		let geohash;
		const historyResult = pcloc.lookupHistory.get(postcode);
		if (historyResult) {
			geohash = historyResult.value; // Use .value so 'if (historyResult)' doesn't fail when geohash is null
		}
		else {
			geohash = postcodeToGeohash(postcode);
			pcloc.lookupHistory.add(postcode, geohash);
		}
		if (geohash === null) {
			if (debug) pcloc.debug.lookup_ms = performance.now() - start_ms;
			return null;
		}

		const [lat, lon] = geohashToLatLon(geohash);
		const result = {
			geohash,
			lat,
			lon
		};

		if (debug) {
			pcloc.debug.lookup_ms = performance.now() - start_ms;
			console.log(`Lookup time: ${pcloc.debug.lookup_ms} ms`);
		}
		return result;
	});

	return pcloc;
}
