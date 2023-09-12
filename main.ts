import * as readline from "https://deno.land/std@0.140.0/node/readline.ts";
import { stdout } from "https://deno.land/std@0.140.0/node/process.ts";

type LatLng = { lat: number, lng: number }

type ElevationResult = {
	center: number,
	average: number,
	min: number,
	max: number,
	variance: number
}

type Coord = {
	panoId?: string,
	lat: number,
	lng: number,
	heading?: number,
	pitch?: number,
	zoom?: number,
	elevation?: ElevationResult,
	imageDate?: string,
	links?: string[],
	countryCode?: string|null,
	stateCode?: string|null,
	extra?: {tags?: string[]},
};

type CoordJSON = {
	name?: string,
	customCoordinates: Coord[]
};

type Tile = {
	file_name: string,
	cols: number, rows: number, grid_x: number, grid_y: number,
	elevation_min: number, elevation_max: number,
	north: number, south: number, east: number, west: number
}

const DATA_DIR = `./data`;
const DATA_CACHE: Record<string, Int16Array> = {};

const TILE_DEFINITIONS: Tile[] = [{
	file_name: `a10g`,
	cols: 10800, rows: 4800, grid_x: 0, grid_y: 0,
	elevation_min: 1, elevation_max: 6098,
	north: 90, south: 50, west: -180, east: -90
},{
	file_name: `b10g`,
	cols: 10800, rows: 4800, grid_x: 1, grid_y: 0,
	elevation_min: 1, elevation_max: 3940,
	north: 90, south: 50, west: -90, east: 0
},{
	file_name: `c10g`,
	cols: 10800, rows: 4800, grid_x: 2, grid_y: 0,
	elevation_min: -30, elevation_max: 4010,
	north: 90, south: 50, west: 0, east: 90
},{
	file_name: `d10g`,
	cols: 10800, rows: 4800, grid_x: 3, grid_y: 0,
	elevation_min: 1, elevation_max: 4588,
	north: 90, south: 50, west: 90, east: 180
},{
	file_name: `e10g`,
	cols: 10800, rows: 6000, grid_x: 0, grid_y: 1,
	elevation_min: -84, elevation_max: 5443,
	north: 50, south: 0, west: -180, east: -90
},{
	file_name: `f10g`,
	cols: 10800, rows: 6000, grid_x: 1, grid_y: 1,
	elevation_min: -40, elevation_max: 6085,
	north: 50, south: 0, west: -90, east: 0
},{
	file_name: `g10g`,
	cols: 10800, rows: 6000, grid_x: 2, grid_y: 1,
	elevation_min: -407, elevation_max: 8752,
	north: 50, south: 0, west: 0, east: 90
},{
	file_name: `h10g`,
	cols: 10800, rows: 6000, grid_x: 3, grid_y: 1,
	elevation_min: -63, elevation_max: 7491,
	north: 50, south: 0, west: 90, east: 180
},{
	file_name: `i10g`,
	cols: 10800, rows: 6000, grid_x: 0, grid_y: 2,
	elevation_min: 1, elevation_max: 2732,
	south: -50, north: 0, west: -180, east: -90
},{
	file_name: `j10g`,
	cols: 10800, rows: 6000, grid_x: 1, grid_y: 2,
	elevation_min: -127, elevation_max: 6798,
	south: -50, north: 0, west: -90, east: 0
},{
	file_name: `k10g`,
	cols: 10800, rows: 6000, grid_x: 2, grid_y: 2,
	elevation_min: 1, elevation_max: 5825,
	south: -50, north: 0, west: 0, east: 90
},{
	file_name: `l10g`,
	cols: 10800, rows: 6000, grid_x: 3, grid_y: 2,
	elevation_min: 1, elevation_max: 5179,
	south: -50, north: 0, west: 90, east: 180
},{
	file_name: `m10g`,
	cols: 10800, rows: 4800, grid_x: 0, grid_y: 3,
	elevation_min: 1, elevation_max: 4009,
	south: -90, north: -50, west: -180, east: -90
},{
	file_name: `n10g`,
	cols: 10800, rows: 4800, grid_x: 1, grid_y: 3,
	elevation_min: 1, elevation_max: 4743,
	south: -90, north: -50, west: -90, east: 0
},{
	file_name: `o10g`,
	cols: 10800, rows: 4800, grid_x: 2, grid_y: 3,
	elevation_min: 1, elevation_max: 4039,
	south: -90, north: -50, west: 0, east: 90
},{
	file_name: `p10g`,
	cols: 10800, rows: 4800, grid_x: 3, grid_y: 3,
	elevation_min: 1, elevation_max: 4363,
	south: -90, north: -50, west: 90, east: 180
}];

function get_tile_for_coord(point: LatLng): Tile|undefined {
	for(const tile of TILE_DEFINITIONS) {
		const matchesLat = (tile.south <= point.lat && point.lat < tile.north);
		const matchesLng = (tile.west <= point.lng && point.lng < tile.east);
		if(matchesLat && matchesLng) return tile;
	}
}

function relative_pos(target: number, min: number, max: number, cells: number): number {
	const percent = (target - min) / (max - min);
	return Math.round(cells * percent);
}

function get_col(target: number, tile: Tile): number {
	return relative_pos(target, tile.west, tile.east, tile.cols);
}

function get_row(target: number, tile: Tile): number {
	return relative_pos(target, tile.north, tile.south, tile.rows);
}

function clamp_coordinate(coord: number, range: number): number {
	const positive_offset = Math.ceil(Math.abs(coord / (range * 2))) * (range * 2);
	return (((coord + positive_offset) + range) % (range * 2)) - range;
}

function distance_from_point(point: LatLng, metres_lat: number, metres_lng: number): LatLng {
	const earth_radius_km = 6378.137;
	const metre_in_degrees = (1 / ((2 * Math.PI / 360) * earth_radius_km)) / 1000;
	const lat = point.lat + (metres_lat * metre_in_degrees);
	const lng = point.lng + ((metres_lng * metre_in_degrees) / Math.cos(point.lat * (Math.PI / 180)));

	return {
		lat: clamp_coordinate(lat, 90),
		lng: clamp_coordinate(lng, 180),
	}
}

async function load_tile_into_cache(tile: Tile): Promise<void> {
	if(!DATA_CACHE[tile.file_name]) {
		const file = await Deno.readFile(`${DATA_DIR}/${tile.file_name}`);
		DATA_CACHE[tile.file_name] = new Int16Array(file.buffer);
	}
}

async function get_elevation(point: LatLng, apothem: number): Promise<ElevationResult|undefined> {
	const center_tile = get_tile_for_coord(point);
	if(center_tile === undefined) throw new Error(`invalid coordinates provided: lat: ${point.lat}, lng: ${point.lng}`);

	await load_tile_into_cache(center_tile);

	const center_index = (get_row(point.lat, center_tile) * center_tile.cols) + get_col(point.lng, center_tile);
	const center_value: number = DATA_CACHE[center_tile.file_name][center_index];
	if(center_value === -500) return undefined;

	if(apothem === 0) {
		return {
			center: center_value,
			average: center_value,
			min: center_value,
			max: center_value,
			variance: 0
		}
	}
	
	const corners = [
		distance_from_point(point, apothem, -apothem), // top left
		distance_from_point(point, apothem, apothem), // top right
		distance_from_point(point, -apothem, -apothem), // bottom left
		distance_from_point(point, -apothem, apothem), // bottom right
	];

	const tile_list: Tile[] = [];

	const cols: number[] = [];
	const rows: number[] = [];

	for(const corner of corners) {
		const tile = get_tile_for_coord(corner);
		if(tile === undefined) throw new Error(`invalid coordinates provided: lat: ${corner.lat}, lng: ${corner.lng}`);

		cols.push(get_col(corner.lng, tile));
		rows.push(get_row(corner.lat, tile));

		tile_list.push(tile);
		await load_tile_into_cache(tile);
	}

	const grid_width = (tile_list[0].grid_x != tile_list[1].grid_x) ? 2 : 1;
	const grid_height = (tile_list[0].grid_y != tile_list[2].grid_y) ? 2 : 1;

	if(grid_width > 2 || grid_height > 2) throw new Error(`only supports regions that cover up to a 2x2 grid of tiles`);

	let col_span = cols[3] - cols[0];
	let row_span = rows[3] - rows[0];

	if(grid_width > 1) col_span = (tile_list[0].cols - cols[0]) + cols[3];
	if(grid_height > 1) row_span = (tile_list[0].rows - rows[0]) + rows[3];

	let total = 0;
	const values: number[] = [];

	for(let i = cols[0]; i <= col_span + cols[0]; i++) {
		for(let j = rows[0]; j <= row_span + rows[0]; j++) {
			const grid_x = i > tile_list[0].cols ? 1 : 0;
			const grid_y = j > tile_list[0].rows ? 1 : 0;
			const tile = tile_list[(grid_y * 2) + grid_x];
			const col = i % tile_list[0].cols;
			const row = j % tile_list[0].rows;
			const index = (row * tile.cols) + col;

			const value = DATA_CACHE[tile.file_name][index];
			if(value === -500) continue;

			values.push(value);
			total += value;
		}
	}

	if(values.length === 0) {
		return undefined;
	}

	const mean = total / values.length;
	let diff_sum = 0;

	let min_elevation = Number.POSITIVE_INFINITY;
	let max_elevation = Number.NEGATIVE_INFINITY;

	for(const v of values) {
		diff_sum += (v - mean) ** 2;
		min_elevation = Math.min(min_elevation, v);
		max_elevation = Math.max(max_elevation, v);
	}

	return {
		center: center_value,
		average: mean,
		min: min_elevation,
		max: max_elevation,
		variance: diff_sum / values.length,
	}
}

function help(): void {
	console.log(`How To Use:`);
	console.log(`    $ %cdeno run -A main.ts %c<input_file_path.json> <apothem>`, `color: yellow`, `color: green`);
	console.log(`        %c<input_file_path.json>%c: file path to the json file of coordinates you want to get the data for`, `color: green`, `color: none`);
	console.log(`        %c<apothem>%c:              distance in metres to check in each direction from the coordinate to calculate variance`, `color: green`, `color: none`);
}

function progress_bar(length: number, percent: number): string {
	let bar = '';
	for(let i = 0; i < length; i++) {
		bar += (i / (length - 1) <= percent) ? '█' : '░';
	}
	return `|${bar}|`;
}

function clear_lines(n: number): void {
	for(let i = 0; i < n; i++) {
		readline.moveCursor(stdout, 0, i === 0 ? 0 : -1);
		readline.clearLine(stdout);
	}
	readline.cursorTo(stdout, 0);
}

async function main(): Promise<void> {
	if(Deno.args.length < 2) {
		help();
		return;
	}

	const input_file_path = Deno.args[0];
	const apothem = parseFloat(Deno.args[1]);

	if(isNaN(apothem)) throw new Error(`Apothem must be a number`);
	
	console.log('Loading input file...');

	const decoder = new TextDecoder('utf-8');
	const input_file = await Deno.readFile(input_file_path);
	const input_data: CoordJSON = JSON.parse(decoder.decode(input_file));

	if(!input_data) {
		throw new Error(`Could not read the input file, please make sure it's valid JSON format`);
	}

	if(!input_data.customCoordinates || input_data.customCoordinates.length === 0) {
		throw new Error(`File does not contain any valid locations`);
	}
	
	const data_len = input_data.customCoordinates.length;
	let failed = 0;

	for(let i = 0; i < data_len; i++) {
		const loc = input_data.customCoordinates[i];

		if(i > 0) {
			clear_lines(3);	
		}
		
		const percent = i / (data_len - 1);
		stdout.write(`\nProcessing locations ${progress_bar(20, percent)} ${(i + 1).toLocaleString()} / ${data_len.toLocaleString()} (${Math.round(percent * 100)}%)\n`);

		const elevation = await get_elevation({lat: loc.lat, lng: loc.lng}, apothem);
		if(!elevation) {
			failed++;
			continue;
		}

		input_data.customCoordinates[i].elevation = elevation;
	}
	
	const encoder = new TextEncoder();
	const output_data = encoder.encode(JSON.stringify(input_data));
	await Deno.writeFile('output.json', output_data);

	console.log(`\nSuccessfully calculated the elevation for %c${(data_len - failed).toLocaleString()} / ${data_len.toLocaleString()} %clocations with an apothem of %c${apothem.toLocaleString()} %cmetres.`, `color: green`, `color: none`, `color: green`, `color: none`);

	if(failed > 0) {
		console.log(`\nElevation for %c${failed.toLocaleString()} %clocations could not be found. This usually happens when the location is too close to water or other areas that don't have elevation data.`, `color: red`, `color: none`);
	}

	console.log(`\nOutput saved to %c"output.json"`, `color: green`);
}

main();
