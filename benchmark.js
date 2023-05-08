/*
    Generate a test dataset and benchmark the recursive algorithm using the prepared dataset.
    Built for this implementation of pix2pix: https://github.com/junyanz/pytorch-CycleGAN-and-pix2pix
    Copy the ./datasets_test/<dataset_name>/ folder to /path/to/implementation/datasets/<model_name>/ for benchmarking the model
    To benchmark the model run implementation with --phase <dataset_name>
    Allowed cli arguments include 
        -n <name>  Custom name for dataset (default: dataset_<timestamp>)
        -s <size>  Set canvas height for data in dataset (default: 64)
        -us        Upscale from 64 to fit size instead of adjusting canvas size
        -bw        Generate dataset with only 4 tones of gray instead of 10 colors
        -co        Only include moves with changes
*/

const Jimp = require('jimp');
const fs = require('fs');
const Path = require('node:path');
const crypto = require('crypto');

const { CBACK, CTEXT, ICONS, prep, save, spread, success, logPathProgress } = require("./src/utils");
const { getSize, getName } = require('./src/cli');

// get and combine all paths
process.stdout.write(CTEXT.RESET + ICONS.WAIT + " getting map paths");
let paths = fs.readdirSync("./maps");
let paths_extra = fs.readdirSync("./maps_extra");
let paths_exclusive = fs.readdirSync('./maps_exclusive');
paths = [...paths.map(p => Path.join("./maps/", p)), ...paths_extra.map(p => Path.join("./maps_extra/", p)), ...paths_exclusive.map(p => Path.join("./maps_exclusive/", p))];
success("getting map paths");

// function to simulate a match and save all moves with consequences
function simMoves(obj, name) {
    return new Promise(async (resolve) => {
        let image = obj.image;
        let map = structuredClone(obj.map);

        let charge = 0;
        // get all cells a player could make a turn on
        let cells = map.flat().filter(cell => cell.connections.length > 0);

        // initialize players
        let lastplayer = -1;
        let player = { charge: 0 };
        let players = [{ hex: 0xFF_00_00_FF, charge: 0, actualCharge: 0 }, { hex: 0x00_FF_00_FF, charge: 0, actualCharge: 0 }, { hex: 0x00_00_FF_FF, charge: 0, actualCharge: 0 }, { hex: 0xFF_FF_00_FF, charge: 0, actualCharge: 0 }, { hex: 0xFF_00_FF_FF, charge: 0, actualCharge: 0 }, { hex: 0x00_FF_FF_FF, charge: 0, actualCharge: 0 }, { hex: 0xFF_80_00_FF, charge: 0, actualCharge: 0 }, { hex: 0x80_00_FF_FF, charge: 0, actualCharge: 0 }];

        let moves = [];

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

            // determine condition for moves to save
            // save all moves
            let condition = (cell) => cell.player.hex === player.hex || cell.charge < 1;
            // only save moves with changes
            if (process.argv.includes("-co")) condition = (cell) => cell.player.hex === player.hex && cell.charge === cell.connections.length - 1;
            // save all possible moves
            let data = { moves: cells.filter(condition).map(cell => cells.indexOf(cell)), players: structuredClone(players), cells: structuredClone(cells), playerIndex: lastplayer };
            moves.push(data);
            fs.mkdirSync(`${dpath}${name}/${charge}`, { recursive: true });

            // calculate and save all consequences for inference
            for (let i = 0; i < data.moves.length; ++i) {
                // get initial state
                let _players = structuredClone(players), _cells = structuredClone(cells);
                // link players objects, if player is set
                _cells.forEach(cell => cell.player = _players.find(p => p.hex === cell.player.hex) ?? cell.player);

                // prepare images
                let canvas = await Jimp.create(size * 2, size);
                let premove = await Jimp.create(image);
                let postmove = await Jimp.create(image);

                // perform move
                move(_players, _players[lastplayer], _cells[data.moves[i]], charge, false);

                // save image of before the consequences
                save(_cells, premove, charge);

                // determine if there were consequences, if so execute consequences
                let s = false;
                if (_cells[data.moves[i]].charge >= _cells[data.moves[i]].connections.length) {
                    spread(_players, _players[lastplayer], [_cells[data.moves[i]]], charge);
                    s = true;
                }

                // if no consequences and only tracking consequences, skip
                if (!s && process.argv.includes("-co")) continue;

                // generate final image
                save(_cells, postmove, charge);

                // upscale image if requested
                if (process.argv.includes("-us")) {
                    premove = (await Jimp.create(64, 64)).composite(premove, 0, 0).scaleToFit(size, size, Jimp.RESIZE_NEAREST_NEIGHBOR);
                    postmove = (await Jimp.create(64, 64)).composite(postmove, 0, 0).scaleToFit(size, size, Jimp.RESIZE_NEAREST_NEIGHBOR);
                }

                // composite image
                canvas.composite(premove, 0, 0);
                canvas.composite(postmove, size, 0);

                // save image
                let guid = crypto.randomUUID();
                canvas.writeAsync(`${dpath}${name}/${charge}/${guid}.png`);
            }

            // simulate a move on a cell
            function move(players, player, cell, charge, doSpread = true) {
                // update metadata
                cell.player = player;
                cell.lastChange = charge;
                ++cell.player.charge;
                ++cell.charge;

                if (doSpread) spread(players, player, [cell], charge);
            }

            // try to find a valid move randomly
            let _charge = charge;
            for (let attempt = 0; attempt < cells.length / 2; attempt++) {
                let index = Math.floor(Math.random() * cells.length);
                if (cells[index].charge > 0 && cells[index].player != player) continue;
                move(players, player, cells[index], ++charge);
                break;
            }

            // if no valid move was found, try again but only include valid moves
            // this will cap worst cost at O(n * 1.5)
            if (charge == _charge) {
                let _cells = cells.filter(cell => cell.charge < 1 || cell.player == player);
                let index = Math.floor(Math.random() * _cells.length);
                move(players, player, _cells[index], ++charge);
            }
        } while (players.filter(player => player.charge > 0).length > 1 || charge < 8);
        resolve(moves);
    });
}

// function to perform benchmark on an array of turns
function benchmark(turns) {
    return new Promise(async (resolve) => {
        // define vars
        let cells, player, players;

        // simulate a move on a cell
        function move(cell, charge) {
            // update metadata
            cell.player = player;
            cell.lastChange = ++charge;
            ++cell.player.charge;
            ++cell.charge;

            // if cell is NOT fully charged: done here
            if (cell.charge < cell.connections.length) return;

            // execute consequences
            spread(players, player, [cell], charge);
        }

        for (let t = 0; t < turns.length; ++t)
            for (let m = 0; m < turns[t].moves.length; ++m) {
                // load state
                players = structuredClone(turns[t].players), cells = structuredClone(turns[t].cells), player = players[turns[t].playerIndex];
                // link player objects from cell to player
                cells.forEach(cell => cell.player = players.find(p => p.hex === cell.player.hex) ?? cell.player);
                // perform move
                move(cells[turns[t].moves[m]], t);
            }

        // done
        resolve();
    });
}

let size = getSize();
let dname = getName();

process.stdout.write(CTEXT.RESET + ICONS.WAIT + " creating paths");
let dpath = `./datasets_test/${dname}/`;

if (!fs.existsSync(dpath)) {
    fs.mkdirSync(dpath, { recursive: true });
}
success("creating paths");

async function main() {
    process.stdout.write(CTEXT.RESET + ICONS.WAIT + " loading maps");
    let maps = [];
    for (let i = 0; i < paths.length; ++i) {
        logPathProgress(16, i, paths);
        maps.push(await prep("", paths[i]));
    }
    success("loading maps");

    let moves = [];
    let promises = [];
    process.stdout.write(CTEXT.RESET + ICONS.WAIT + " preparing benchmark");
    let j = 0; // variable to track progress
    let start = Date.now();
    // start all simulations at once for better performance, log progress, save results
    for (let i = 0; i < paths.length; ++i)
        promises.push(simMoves(maps[i], paths[i].replace(Path.sep, "_")).then(result => { logPathProgress(23, ++j, paths, false); moves.push(result); }));

    // wait for all promises to resolve
    await Promise.all(promises);
    success("preparing benchmark");
    process.stdout.write(CTEXT.INFO + ICONS.INFO + ` preparing took ${Date.now() - start}ms! samples are located at ${Path.resolve(dpath)}.` + CTEXT.RESET + "\n");

    process.stdout.write(CTEXT.RESET + ICONS.WAIT + " running benchmark");
    start = Date.now();
    for (let i = 0; i < moves.length; ++i) await benchmark(moves[i]);
    success("running benchmark");

    process.stdout.write(CTEXT.INFO + ICONS.INFO + ` the recursive algorithm took ${CTEXT.RESET + CBACK.INFO} ${Date.now() - start}ms ${CTEXT.RESET + CTEXT.INFO} to calculate the consequences of every move!` + CTEXT.RESET + "\n");
}

main();