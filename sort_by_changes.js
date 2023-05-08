/*
    Generate flat distribution based on changes.
    Use flatdist_compiler to sort dataset for use with pix2pix.
    Built for this implementation of pix2pix: https://github.com/junyanz/pytorch-CycleGAN-and-pix2pix
    Allowed cli arguments include:
        -%      Base flat distribution on percentage of changes
*/

const fs = require('fs');
const Path = require('node:path');
const Jimp = require('jimp');
const { getTimeDiffStr } = require('./src/utils');

// print syntax help
if (process.argv.length < 3) {
    console.log(`\nSyntax: node sort_by_changes <path>\n`);
    return;
}

// check if color f is in range of color b
// f is in range if R G and B are no more than 60 off from b's RGB
function rangeCheck(b, f) {
    return Math.abs(Math.floor(b / (256 * 256 * 256)) - Math.floor(f / (256 * 256 * 256))) < 60
        && Math.abs((Math.floor(b / (256 * 256)) % 256) - (Math.floor(f / (256 * 256)) % 256)) < 60
        && Math.abs((Math.floor(b / 256) % 256) - (Math.floor(f / 256) % 256)) < 60;
}

let use_percent = process.argv.includes("-%");

// get all the image paths
let _path = Path.join(process.argv[2], "all");
let path_save = Path.join(process.argv[2], `flatdist${use_percent ? 3 : 2}`);
console.log("Getting paths...");
let time = Date.now();
let paths = fs.readdirSync(_path);
let diff = new Date(Date.now() - time);
console.log(`Done in ${getTimeDiffStr(diff)}!`);

if (!fs.existsSync(path_save)) fs.mkdirSync(path_save);

let counts = [];
counts[1000] = 0;
counts.fill(0);

// batch size for parallelization
const BATCH_SIZE = 16;

async function main() {
    let time = Date.now();
    // for every batch
    for (let b = 0; b < Math.ceil(paths.length / BATCH_SIZE); ++b) {
        let promises = [];
        let black = await Jimp.create(64, 64, 0);
        // for every image in batch
        for (let i = b * BATCH_SIZE; i < paths.length && i - (b * BATCH_SIZE) < BATCH_SIZE; ++i) {
            promises.push(new Promise(async (resolve) => {
                // get images
                let path = Path.join(_path, paths[i]);
                let img;
                try {
                    img = await Jimp.read(path);
                } catch (ex) { resolve(); return; } // do not include corrupt images
                let a = (await Jimp.create(img)).crop(0, 0, img.getHeight(), img.getHeight())
                let b = (await Jimp.create(img)).crop(img.getHeight(), 0, img.getHeight(), img.getHeight());

                // compare in original size
                a.scaleToFit(64, 64);
                b.scaleToFit(64, 64);

                let changes = 0;
                let total = 0;

                // count changes in total
                function detectChange(x, y) {
                    if (!rangeCheck(a.getPixelColor(x, y), b.getPixelColor(x, y))) ++changes;
                    if (use_percent && !rangeCheck(a.getPixelColor(x, y), black.getPixelColor(x, y))) ++total;
                }

                // for every 4x4 pixel block
                for (let y = 0; y < a.getHeight() / 4; ++y)
                    for (let x = 0; x < a.getWidth() / 4; ++x) {
                        let _total = total;

                        // count changes and total amount of pixels
                        detectChange(x * 4 + 1, y * 4);
                        detectChange(x * 4 + 2, y * 4 + 1);
                        detectChange(x * 4 + 1, y * 4 + 2);
                        detectChange(x * 4, y * 4 + 1);

                        // the max amount of changes for every 4x4 pixel block is the amount of pixels - 1
                        // so if this includes valid pixels, remove one
                        if (_total < total) --total;
                    }

                // if max exceeded, do not save
                if (use_percent && ++counts[Math.floor(changes/total*100)] > 1000) { resolve(); return; }
                else if (++counts[changes] > 1000) { resolve(); return; }
                
                // get patch
                let path_save_changes;
                if (use_percent) path_save_changes = Path.join(path_save,Math.floor(changes/total*100).toString());
                else path_save_changes = Path.join(path_save, changes.toString());

                // save file
                if (!fs.existsSync(path_save_changes)) fs.mkdirSync(path_save_changes);
                fs.copyFile(path, Path.join(path_save_changes, paths[i]), () => { });
                resolve();
            }));
        }
        // wait for batch to complete, optimizing this is probably not beneficial
        await Promise.all(promises);
        // every 1000 batches, report progress
        if (b % 1000 == 0) {
            let diff = new Date((Date.now() - time) * Math.ceil((paths.length / BATCH_SIZE - b) / 1000));
            console.log(`[${(b / 1000).toString().padStart(4, "0")}k/${Math.ceil(paths.length / BATCH_SIZE / 1000).toString().padStart(4, "0")}k] [ETA ${getTimeDiffStr(diff)}]`);
            time = Date.now();
        }
    }
}
main();