async function PostcodeLocaties(options = {}) {
	const {
		basePath = "src/",
		bitmapFile = {
			compressed: "bitmap.bin.gz",
			uncompressed: "bitmap.bin",
		},
		coordsFile = {
			compressed: "coords.bin.gz",
			uncompressed: "coords.bin",
		}
	} = options;

	const isGzipSupported = typeof DecompressionStream === "function";

	let bitmapBits = null;
	let coordsBytes = null;

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
		let bitmapBytes = null;

		if (isGzipSupported) {
			[bitmapBytes, coordsBytes] = await Promise.all([
				fetchBinary(basePath + bitmapFile.compressed, true),
				fetchBinary(basePath + coordsFile.compressed, true)
			]);
		}
		else {
			[bitmapBytes, coordsBytes] = await Promise.all([
				fetchBinary(basePath + bitmapFile.uncompressed, false),
				fetchBinary(basePath + coordsFile.uncompressed, false)
			]);
		}

		bitmapBits = [];
		for (const byte of bitmapBytes) {
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

	try {
		await fetchBinaries();

		const start = performance.now();
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
		console.log(`Counting valid postcodes took ${performance.now() - start} ms.`);
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
		console.log({bitmap_index: index, postcode: postcode, value: bit, coords_index: bit ? (offset_validsum + coords_index) : null});
		if (!bit) {
			return null;
		}
		const char0 = coordsBytes[(offset_validsum + coords_index)*4 + 0]
		const char1 = coordsBytes[(offset_validsum + coords_index)*4 + 1]
		const char2 = coordsBytes[(offset_validsum + coords_index)*4 + 2]
		const char3 = coordsBytes[(offset_validsum + coords_index)*4 + 3]
		return 'u1' + String.fromCharCode(char0, char1, char2, char3);
	}

	var pcloc = Object();

	pcloc.lookup = ((postcode) => {
		const gh = postcodeToGeohash(postcode);
		const [lat, lon] = geohash.decode(gh);
		return {
			gh,
			lat,
			lon
		};
	});

	return pcloc;
}
