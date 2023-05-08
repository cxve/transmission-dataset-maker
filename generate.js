/*
    Generate a dataset for pix2pix containing simulated game data from Spread: Transmission.
    Includes various options to customize generated dataset for experimentation.
    Simulates random player moves on a map until there is a winner, for every map.
    The generated dataset is placed in ./datasets/dateset_TIMESTAMP/
    For training a pix2pix model, use the ./datasets/dateset_TIMESTAMP/sorted folder.
    Built for this implementation of pix2pix: https://github.com/junyanz/pytorch-CycleGAN-and-pix2pix
*/

const crypto = require('crypto');
const Jimp = require('jimp');
const fs = require('fs');
const Path = require('node:path');
let start_absolute = Date.now();

const { CBACK, CTEXT, ICONS, boxlog, prep, save, spread, success, logPathProgress, getTimeDiffStr } = require("./src/utils");
const { getSize, getName, getPath } = require('./src/cli');

// function to print help
function help() {
    boxlog(CBACK.ERROR);
    boxlog(CBACK.ERROR + CTEXT.INVERT, `    Syntax: node generate <amount> [-h] [-bw] [-dc] [-s <size>]`);
    boxlog(CBACK.ERROR + CTEXT.INVERT, `      -s <size>  Set canvas height for data in dataset (default: 64)`);
    boxlog(CBACK.ERROR + CTEXT.INVERT, `      -m <path>  Custom path to maps folder (default: maps)`);
    boxlog(CBACK.ERROR + CTEXT.INVERT, `      -n <name>  Custom name for dataset (default: dataset_<timestamp>)`);
    boxlog(CBACK.ERROR + CTEXT.INVERT, `      -fd        Additionally sort sample based on the amount of iterations`);
    boxlog(CBACK.ERROR + CTEXT.INVERT, `                 required to solve the map`);
    boxlog(CBACK.ERROR + CTEXT.INVERT, `      -ex        Exclude extra maps from training set, making them exclusive`);
    boxlog(CBACK.ERROR + CTEXT.INVERT, `                 to the validation and testing set`);
    boxlog(CBACK.ERROR + CTEXT.INVERT, `      -ns        Do not create a sorted dataset from generated images`);
    boxlog(CBACK.ERROR + CTEXT.INVERT, `      -us        Upscale from 64 to fit size instead of adjusting canvas size`);
    boxlog(CBACK.ERROR + CTEXT.INVERT, `      -dc        Randomly discard data with only very few changes`);
    boxlog(CBACK.ERROR + CTEXT.INVERT, `      -bw        Generate dataset with only 4 tones of gray instead of 10 colors`);
    boxlog(CBACK.ERROR + CTEXT.INVERT, `      -h         Print this help screen`);
    boxlog(CBACK.ERROR);
    process.exit(1);
}

// print help
if (process.argv.length < 3 || process.argv.includes('-h')) help();

// determine the required amount of sets, if invalid print help
let sets = Number.parseInt(process.argv[2]);
if (Number.isNaN(sets) || sets < 1) help();

// determine image height
let size = getSize();

// determine map path
let path_maps = getPath();

// determine dataset name
let dname = getName();

let entry = 0;

// simulate games
async function genData(obj, max = 0) {
    return new Promise(async (resolve) => {
        let image = obj.image;
        let map = structuredClone(obj.map);

        let charge = 0;

        // get all cells a player could make a turn on
        let cells = map.flat().filter(cell => cell.connections.length > 0);

        // initialize players
        let lastplayer = -1;
        let player;
        let players = [{ hex: 0xFF_00_00_FF, charge: 0, actualCharge: 0 }, { hex: 0x00_FF_00_FF, charge: 0, actualCharge: 0 }, { hex: 0x00_00_FF_FF, charge: 0, actualCharge: 0 }, { hex: 0xFF_FF_00_FF, charge: 0, actualCharge: 0 }, { hex: 0xFF_00_FF_FF, charge: 0, actualCharge: 0 }, { hex: 0x00_FF_FF_FF, charge: 0, actualCharge: 0 }, { hex: 0xFF_80_00_FF, charge: 0, actualCharge: 0 }, { hex: 0x80_00_FF_FF, charge: 0, actualCharge: 0 }];

        // while at least two players are not eliminated
        do {
            // determine the next player
            for (let i = 1; i < 8; i++) {
                let newplayer = (lastplayer + i) % 8;
                if (players[newplayer].charge < 1 && charge > 7) continue;
                lastplayer = newplayer;
                player = players[newplayer];
                break;
            }

            // simulate a move on a cell
            async function move(cell) {
                // update metadata
                cell.player = player;
                cell.lastChange = ++charge;
                ++cell.player.charge;
                ++cell.charge;

                // if cell is NOT fully charged: done here
                if (cell.charge < cell.connections.length) return;

                // prepare images
                let canvas = await Jimp.create(size * 2, size);
                let premove = await Jimp.create(image);
                let postmove = await Jimp.create(image);

                // save image before consequences
                save(cells, premove, charge);

                // execute consequences
                let sc = spread(players, player, [cell], charge);

                // generate final image
                save(cells, postmove, charge);

                // if upscale enabled: upscale
                if (process.argv.includes("-us")) {
                    premove = (await Jimp.create(64, 64)).composite(premove, 0, 0).scaleToFit(size, size, Jimp.RESIZE_NEAREST_NEIGHBOR);
                    postmove = (await Jimp.create(64, 64)).composite(postmove, 0, 0).scaleToFit(size, size, Jimp.RESIZE_NEAREST_NEIGHBOR);
                }

                // composite image
                canvas.composite(premove, 0, 0);
                canvas.composite(postmove, size, 0);

                // save image
                let guid = crypto.randomUUID();
                canvas.writeAsync(`${dpath}all/${guid}.png`).then(_ => {
                    // if discard is enabled, randomly decide to not include a sample into the dataset
                    // chance is linear x/5, so if the sample required 5 iteration it is guarantueed to be included
                    if (process.argv.includes("-dc") && Math.random() > sc / 5) return;

                    // if generating test / validation dataset right now and maximum exceeded, return
                    if (max > 0 && entry > max) return;
                    let _entry = entry++;

                    // save sample sorted by required iteration
                    if (process.argv.includes("-fd")) {
                        if (!fs.existsSync(`${dpath}flatdist/${sc}`)) fs.mkdirSync(`${dpath}flatdist/${sc}`);
                        fs.copyFile(`${dpath}all/${guid}.png`, `${dpath}flatdist/${sc}/${guid}.png`, () => { });
                    }

                    if (process.argv.includes("-ns")) return;
                    // determine where to include the sample
                    if (max > 0) {
                        if (_entry % 2 == 0) fs.copyFile(`${dpath}all/${guid}.png`, `${dpath}sorted/test/${guid}.png`, () => { });
                        else if (_entry % 2 == 1) fs.copyFile(`${dpath}all/${guid}.png`, `${dpath}sorted/val/${guid}.png`, () => { });
                    }
                    else fs.copyFile(`${dpath}all/${guid}.png`, `${dpath}sorted/train/${guid}.png`, () => { });
                });
            }

            // try to find a valid move randomly
            let _charge = charge;
            for (let attempt = 0; attempt < cells.length / 2; attempt++) {
                let index = Math.floor(Math.random() * cells.length);
                if (cells[index].charge > 0 && cells[index].player != player) continue;
                await move(cells[index]);
                break;
            }

            // if no valid move was found, try again but only include valid moves
            // this will cap worst cost at O(n * 1.5)
            if (charge == _charge) {
                let _cells = cells.filter(cell => cell.charge < 1 || cell.player == player);
                let index = Math.floor(Math.random() * _cells.length);
                await move(_cells[index]);
            }
        } while (players.filter(player => player.charge > 0).length > 1 || charge < 8);
        resolve();
    });
}

// invoke generation
async function invokeGenData(maps, sets, genstring, max = 0) {
    // timestamps for estimates
    let timestamps = [];
    let _entry = 0;
    entry = 0;
    // generate the requested amount of data
    for (let i = 0; i < sets && (max < 1 || entry < max); i++) {
        process.stdout.cursorTo(genstring.length - 3);
        
        // calculate average time for every batch of images
        let avg = 0;
        timestamps.forEach(t => avg += max > 0 ? t / (entry - _entry) : t);
        avg /= timestamps.length > 0 ? timestamps.length : 1;
        _entry = entry;

        // calculate time estimate
        let estimate = new Date(avg * (sets - i));
        if (max > 0) estimate = new Date(avg * (max - entry));

        // print estimate
        let simstring = `[${i.toString().padStart("4", "0")}/${sets.toString().padStart("4", "0")}] `
            + `(${Math.round(i / sets * 100).toString().padStart("2", "0")}%) `
            + `[ETA ${getTimeDiffStr(estimate)}]`;
        if (max > 0) simstring = `[${entry.toString().padStart("4", "0")}/${max.toString().padStart("4", "0")}] `
            + `(${Math.round(entry / max * 100).toString().padStart("2", "0")}%) `
            + `[ETA ${getTimeDiffStr(estimate)}]`;
        process.stdout.write(simstring);

        // simulate a game for every map
        let promises = [];
        let start = Date.now();
        for (let j = 0; j < maps.length; j++) promises.push(genData(maps[j], max));
        await Promise.all(promises);

        // save timestamp, remove old timestamp
        timestamps.push(Date.now() - start);
        if (timestamps.length > 50) timestamps.shift();
    }
}

process.stdout.write(CTEXT.RESET + ICONS.WAIT + " getting map paths");
let paths = fs.readdirSync(path_maps);
let paths_extra = fs.readdirSync("./maps_extra");
success("getting map paths");

process.stdout.write(CTEXT.RESET + ICONS.WAIT + " creating paths");
let dpath = `./datasets/${dname}/`;

if (!fs.existsSync(dpath)) {
    fs.mkdirSync(dpath);
    fs.mkdirSync(dpath + "all");
    if (!process.argv.includes("-ns")) {
        fs.mkdirSync(dpath + "sorted");
        fs.mkdirSync(dpath + "sorted/train");
        fs.mkdirSync(dpath + "sorted/val");
        fs.mkdirSync(dpath + "sorted/test");
    }
    if (process.argv.includes("-fd"))
        fs.mkdirSync(dpath + "flatdist");
}
success("creating paths");

async function main() {
    process.stdout.write(CTEXT.RESET + ICONS.WAIT + " loading maps")
    let maps = [];
    for (let i = 0; i < paths.length; ++i) {
        logPathProgress(16, i, paths);
        maps.push(await prep(path_maps, paths[i]));
    }
    success("loading maps");

    process.stdout.write(CTEXT.RESET + ICONS.WAIT + " loading extra maps")
    let maps_extra = [];
    for (let i = 0; i < paths_extra.length; ++i) {
        logPathProgress(16, i, paths);
        maps_extra.push(await prep("maps_extra", paths_extra[i]));
    }
    success("loading extra maps");

    let genstring = CTEXT.RESET + ICONS.WAIT + ` generating dataset from ${sets} simulation${sets != 1 ? "s" : ""} `;
    process.stdout.write(genstring);
    // when extra maps should be excluded, exclude them from dataset
    await invokeGenData([...maps, ...(process.argv.includes("-ex") ? [] : maps_extra)], sets, genstring);
    success(`generated dataset from ${sets} simulation${sets != 1 ? "s" : ""} with ${entry} sample${entry != 1 ? "s" : ""}`);

    if (!process.argv.includes("-ns")) {
        let max = Math.ceil(entry / 3);
        genstring = CTEXT.RESET + ICONS.WAIT + ` generating ${max} sample${max != 1 ? "s" : ""} for validation and test set `;
        process.stdout.write(genstring);
        await invokeGenData([...maps, ...maps_extra], sets, genstring, max);
        success(`generating ${max} sample${max != 1 ? "s" : ""} for validation and test set`);
    }

    let total = new Date(Date.now() - start_absolute);
    process.stdout.write(CTEXT.INFO + ICONS.INFO + ` simulation completed in ${getTimeDiffStr(total)}! results are located at ${Path.resolve(dpath)}.` + CTEXT.RESET + "\n");
}

main();