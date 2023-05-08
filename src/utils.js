/*
    This file contains various implementations used in multiple files.
*/

const Jimp = require('jimp');
const Path = require('node:path');
let val = 80;

// character codes for visual output
const CTEXT = { ERROR: "\x1b[91m", WARN: "\x1b[33m", SUCCESS: "\x1b[92m", INFO: "\x1b[94m", INVERT: "\x1b[30m", RESET: "\x1b[0m" };
const CBACK = { ERROR: "\x1b[101m", WARN: "\x1b[43m", SUCCESS: "\x1b[102m", INFO: "\x1b[104m", RESET: "\x1b[0m" };
const ICONS = { ERROR: "\u26d4", WARN: "\u26a0", SUCCESS: "\u2714", INFO: "\u2139", WAIT: "\u231b" };

// if alpha exceeds val, this pixel is marked as visible
const condition = (data, idx) => data[idx + 3] > val;

// function to prepare maps
async function prep(base, path) {
    // load image
    let image = await Jimp.read(Path.join(".", base, path));
    let newimage = await Jimp.create(image.getWidth(), image.getHeight());

    // initialize map table
    let map = [];
    for (let y = 0; y * 4 < image.getHeight(); y++) {
        map[y] = [];
        for (let x = 0; x * 4 < image.getWidth(); x++)
            map[y].push({ player: { hex: 0, charge: 0 }, charge: 0, connections: [], x: -1, y: -1, lastChange: 0 });
    }

    // for every pixel on the image
    // could be optimized, but speed is trivial here
    image.scan(0, 0, image.getWidth(), image.getHeight(), function (x, y, idx) {
        // relative x and y for every 4x4 pixel, (0,0) is top-left corner
        let xr = x % 4, yr = y % 4;
        // absolute position for 4x4 pixel block
        let xa = Math.floor(x / 4), ya = Math.floor(y / 4);
        // helper function to set pixel color and metadata
        function setPixel(_x, _y) {
            newimage.setPixelColor(0xFF_FF_FF_FF, x, y);
            map[ya][xa].connections.push(map[ya + _y][xa + _x]);
            map[ya][xa].x = xa; map[ya][xa].y = ya;
        }
        // check if valid pixel contain data, normalize data
        if (xr < 3 && yr < 3 && (xr + yr) % 2 == 1 && condition(this.bitmap.data, idx)) {
            if (xr == 1 && yr == 0) setPixel(0, -1);
            if (xr == 2 && yr == 1) setPixel(1, 0);
            if (xr == 1 && yr == 2) setPixel(0, 1);
            if (xr == 0 && yr == 1) setPixel(-1, 0);
        }
    });

    // save data
    newimage.writeAsync('./maps_normalized/' + path);
    return { path, map, image: newimage };
}

// helper function to set correct pixel colors
function save(cells, jimp, charge) {
    // for every cell
    cells.forEach(cell => {
        // get x and y from the center of the cell
        let x = cell.x * 4 + 1, y = cell.y * 4 + 1;
        // paint all the charged cells in the player's color
        for (let i = 0; i < cell.charge && i < cell.connections.length; i++) {
            // calculate the connected cell's pixel position
            let _x = -1, _y = -1;
            if (i < cell.connections.length) {
                _x = cell.x != cell.connections[i].x ? Math.sign(cell.connections[i].x - cell.x) : 0;
                _y = cell.y != cell.connections[i].y ? Math.sign(cell.connections[i].y - cell.y) : 0;
            }
            // get color of the cell owner's player
            let hex = process.argv.includes("-bw") ? (cell.lastChange == charge ? 0x55_55_55_FF : 0xAA_AA_AA_FF) : cell.player.hex;
            // set color
            jimp.setPixelColor(hex, x + _x, y + _y);
        }
    });
}

// helper function for visual output
function boxlog(color, content = "") {
    process.stdout.write(color);
    process.stdout.write(content.padEnd(90, " "));
    process.stdout.write(CTEXT.RESET);
    process.stdout.write("\n");
}

// helper function to reset line
function reset() {
    process.stdout.cursorTo(0);
    process.stdout.clearLine(0);
}

// helper function to print error messages
function error(text) {
    reset();
    process.stdout.write("\n" + CTEXT.ERROR + ICONS.ERROR + ` ${text}` + CTEXT.RESET + "\n");
}

// helper function to print success messages
function success(text) {
    reset();
    process.stdout.write(CTEXT.SUCCESS + ICONS.SUCCESS + ` ${text}` + CTEXT.RESET + "\n");
}

// helper function to calculate chain reactions
// returns depth for sorting purposes
function spread(players, player, spreads, charge, depth = 0) {
    // stop if all players are eliminated
    if (players.filter(player => player.charge > 0).length < 2 && charge > 7) return depth;

    // for every cell that needs to be dealt with
    let nextSpread = [];
    spreads.forEach(cell => {
        if (cell.charge < cell.connections.length) return;
        // discharge cell
        cell.charge -= cell.connections.length;
        // if cell is still fully charged, it will cause another chain reaction
        if (cell.charge >= cell.connections.length && !nextSpread.includes(cell)) nextSpread.push(cell);
        // for every connected cell
        cell.connections.forEach(c => {
            // update player owned charge
            if (c.player != player) {
                c.player.charge -= c.charge;
                player.charge += c.charge;
            }
            // update owner
            c.player = player;
            // mark state change
            c.lastChange = charge;
            // if connected cell is now fully charged, it will cause a chain reaction
            if (++c.charge >= c.connections.length && !nextSpread.includes(c)) nextSpread.push(c);
        });
    });

    // if new cells to deal with, continue
    if (nextSpread.length > 0) return spread(players, player, nextSpread, charge, depth + 1);
    return depth + 1;
}

// helper function to log progress when iterating through an array
function logPathProgress(x, i, paths, printPaths = true) {
    process.stdout.cursorTo(x);
    process.stdout.write(`[${i.toString().padStart("2", "0")}/${(paths.length - 1).toString().padStart("2", "0")}] `);
    process.stdout.write(`(${Math.round(i / paths.length * 100).toString().padStart("2", "0")}%)`);
    if (i < paths.length && printPaths) process.stdout.write(`: ${paths[i].padEnd(10, " ")}`);
    process.stdout.clearLine(1);
}

// helper function to get time difference as string
const getTimeDiffStr = (diff) => `${diff.getUTCHours().toString().padStart(2, "0")}:${diff.getUTCMinutes().toString().padStart(2, "0")}:${diff.getUTCSeconds().toString().padStart(2, "0")}`;

module.exports = {
    spread,
    success,
    prep,
    boxlog,
    reset,
    save,
    error,
    logPathProgress,
    getTimeDiffStr,
    CTEXT, CBACK, ICONS,
}