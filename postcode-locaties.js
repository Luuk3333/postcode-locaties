async function PostcodeLocaties(options = {}) {
	const {
		packUrl = 'postcodes.pack',
		packGzUrl = 'postcodes.pack.gz',
		lookupHistorySize = 100,
		debug = false,
	} = options;

	const PACK_VERSION = "1"; // expected version

	const isGzipSupported = typeof DecompressionStream === "function";

	const headerLength = 64;
	const bitmapLength = 6084000/8; // 1000AA = 9*10*10*10*26*26 bits
	let packBytes = null; // all bytes in pack (bitmap + coords)
	let bitmapBits = null; // extracted bits of bitmap
	let packInfo = {}; // decoded pack header

	async function decompressGzip(arrayBuffer) {
		const ds = new DecompressionStream("gzip");
		const decompressedStream = new Response(
			new Blob([arrayBuffer]).stream().pipeThrough(ds)
		);
		return await decompressedStream.arrayBuffer();
	}

	async function fetchBinary(url, isGzip) {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to download file: ${url}`);
		}
		const buffer = await response.arrayBuffer();
		const data = isGzip ? await decompressGzip(buffer) : buffer;
		return new Uint8Array(data);
	}

	async function fetchBinaries() {
		if (isGzipSupported) {
			try {
				packBytes = await fetchBinary(packGzUrl, true);
			} catch (error) {
				console.warn(error)
			}
		}

		if (!packBytes) {
			try {
				packBytes = await fetchBinary(packUrl, false);
			} catch (error) {
				console.warn(error)
			}
		}

		if (!packBytes) {
			throw new Error("Failed to download postcode data.");
		}

		bitmapBits = [];
		for (const byte of packBytes.slice(headerLength, headerLength + bitmapLength)) {
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
			from_history: null,
		};
	}

	function decodeHeader(headerBytes) {
		function decodeString(bytes) {
			return new TextDecoder("ascii")
				.decode(bytes)
				.replace(/\0+$/, ""); // trim padding
		}
		return {
			magic:			decodeString(headerBytes.slice(0, 4)),
			packVersion:	decodeString(headerBytes.slice(4, 20)),
			dataCountry:	decodeString(headerBytes.slice(20, 28)),
			dataSource:		decodeString(headerBytes.slice(28, 36)),
			dataDate:		decodeString(headerBytes.slice(36, 46)),
			packDate:		decodeString(headerBytes.slice(46, 56)),
		}
	}

	try {
		await fetchBinaries();

		// Read header
		const headerBytes = packBytes.slice(0, headerLength);
		packInfo = decodeHeader(headerBytes);
		if (packInfo.magic !== "PCPK") throw new Error("Invalid postcode file");
		if (packInfo.packVersion !== PACK_VERSION) throw new Error(`Postcode pack version mismatch: expected ${PACK_VERSION} but found ${packInfo.packVersion}`);

		// Calculate valid postcodes
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

	function calculateCoordsIndex(postcode, index) {
		// Sum count of prior valid postcodes
		const offset_digit = parseInt(postcode[0], 10);
		let offset_validsum = 0;
		let offset_index = (offset_digit - 1) * 676000;
		for (let i = 1; i < offset_digit; i++) {
			const key = `${i}000s`;
			offset_validsum += offset_valid_count[key] || 0;
		}

		let coords_index = 0;

		// Count postcodes with coordinate in current thousand block
		for (let i = offset_index; i < index; i++) {
			if (bitmapBits[i] === 1) coords_index++;
		}

		return [coords_index, offset_validsum];
	}

	function getGeohashFromPack(coords_index, offset_validsum) {
		const char0 = packBytes[headerLength + bitmapLength + (offset_validsum + coords_index)*4 + 0]
		const char1 = packBytes[headerLength + bitmapLength + (offset_validsum + coords_index)*4 + 1]
		const char2 = packBytes[headerLength + bitmapLength + (offset_validsum + coords_index)*4 + 2]
		const char3 = packBytes[headerLength + bitmapLength + (offset_validsum + coords_index)*4 + 3]
		return 'u1' + String.fromCharCode(char0, char1, char2, char3);
	}

	function postcode6ToGeohash(postcode) {
		const index = postcodeToIndex(postcode);
		const [coords_index, offset_validsum] = calculateCoordsIndex(postcode, index);

		const bit = bitmapBits[index];
		if (debug) console.log({bitmap_index: index, postcode: postcode, value: bit, coords_index: bit ? (offset_validsum + coords_index) : null});
		if (!bit) {
			return null;
		}
		return getGeohashFromPack(coords_index, offset_validsum);
	}

	function postcode4ToGeohashes(postcode) {
		const digits = parseInt(postcode.replace(/\s/g,'').toUpperCase().slice(0, 4), 10);
		const index = (digits - 1000) * 676;
		let [coords_index, offset_validsum] = calculateCoordsIndex(postcode, index);

		let geohashes = [];
		for (let lettersOffset = 0; lettersOffset < 26*26; lettersOffset++) {
			const bit = bitmapBits[index + lettersOffset];
			if (!bit) continue;

			const geohash = getGeohashFromPack(coords_index, offset_validsum);
			geohashes.push(geohash);
			coords_index++;
		}
		return geohashes;
	}

	function postcodeToLatLon(postcode) {
		// Skip postcodes lower than 1000AA like 0123AB
		if (postcode[0] === '0') {
			return null;
		}

		if (postcode.length === 4) {
			const geohashes = postcode4ToGeohashes(postcode);
			if (geohashes.length === 0) return null;

			// Get all coordinates
			let latitudes = [];
			let longitudes = [];
			geohashes.forEach((geohash) => {
				const [lat, lon] = geohashToLatLon(geohash);
				latitudes.push(lat);
				longitudes.push(lon);
			});

			// Calculate average of coordinate
			const sumLat = latitudes.reduce((acc, val) => acc + val, 0);
			const sumLon = longitudes.reduce((acc, val) => acc + val, 0);
			const avgLat = sumLat / latitudes.length;
			const avgLon = sumLon / longitudes.length;
			return {
				geohash: null,
				latitude: avgLat,
				longitude: avgLon,
			}
		}

		const geohash = postcode6ToGeohash(postcode);
		if (geohash === null) return null;
		const [latitude, longitude] = geohashToLatLon(geohash);
		return {
			geohash,
			latitude,
			longitude,
		};
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

	pcloc.getCoordinates = ((postcode) => {
		let start_ms = 0;
		if (debug) start_ms = performance.now();

		// Return geohash from history if available (can permit to calculate lat/long everytime because geohashToLatLon() is fast)
		let result_obj;
		const historyResult = pcloc.lookupHistory.get(postcode);
		if (debug) pcloc.debug.from_history = historyResult !== null;
		if (historyResult) {
			result_obj = historyResult.value; // Use .value so 'if (historyResult)' doesn't fail when result_obj is null
		}
		else {
			result_obj = postcodeToLatLon(postcode);
			pcloc.lookupHistory.add(postcode, result_obj);
		}
		if (result_obj === null) {
			if (debug) pcloc.debug.lookup_ms = performance.now() - start_ms;
			return null;
		}

		if (debug) {
			pcloc.debug.lookup_ms = performance.now() - start_ms;
			console.log(`Lookup time: ${pcloc.debug.lookup_ms} ms`);
		}
		return result_obj;
	});

	const postcode_regex = new RegExp("^([1-9]\\d{3})\\s?([A-Z]{2})?$", "i"); // https://regex101.com/r/4q8C9Y/1

	pcloc.isValid = (postcode) => postcode_regex.test(postcode);

	pcloc.lookup = ((postcode, options = {}) => {
		const {
			includeSpace = true,
		} = options;

		let result = {
			isValid: false,
			postcode: null,
			digits: null,
			letters: null,
			type: null,
			coordinates: null,
			isExisting: false,
		};

		let match = postcode.trim().match(postcode_regex);
		if (!match) {
			return result;
		}

		result.isValid = true;
		result.digits = Number(match[1]);
		if (match[2]) {
			result.letters = match[2]?.toUpperCase();
		}
		result.postcode = result.digits + (includeSpace && result.letters ? ' ' : '') + (result.letters || '');
		result.type = match[2] ? 'pc6' : 'pc4';
		result.coordinates = pcloc.getCoordinates(result.digits + (result.letters || ''));
		result.isExisting = !!result.coordinates;

		return result;
	});

	pcloc.packInfo = (() => {
		return packInfo;
	})

	return pcloc;
}
