/*
    Script to sort -fd dataset.
    
    Syntax: node flatdist_compiler <path> [amount]
    
    [amount] is the amount of images to include per iteration.
    The iteration has to have at least [amount] samples to be included, to reduce bias.

    Allowed cli arguments include:
        -ns     Perform a dry-run, only count the files included
*/

const fs = require('fs');
const Path = require('node:path');

// print syntax help
if (process.argv.length < 3) {
    console.log(`\nSyntax: node flatdist_compiler <path>\n`);
    return;
}

// get and sort paths
let path = Path.join(process.argv[2]);
let paths = fs.readdirSync(path, { withFileTypes: true }).filter(p => p.isDirectory()).map(p => p.name);
let count = 0;
let counts = [];
paths.forEach(p => { let _paths = fs.readdirSync(Path.join(path, p)); counts.push(_paths.length); });
counts.sort((a, b) => b - a);

// determine max amount by formula
let max = counts[Math.floor(counts.length / 2)] + 8;

// if amount is set, overwrite max
if (process.argv.length > 3) {
    let num = Number.parseInt(process.argv[3]);
    if (!Number.isNaN(num) && num > 0) max = num;
}

// count the samples included
let last = 0;
paths.forEach(p => { let _paths = fs.readdirSync(Path.join(path, p)); if (_paths.length >= max) { count += max; if (last < Number(p)) last = p; } });

console.log(`using ${max} as max, there will be ${count} samples in the dataset (${Math.floor(count / 6 * 4)} in the training set) with ${last} being the last iteration with at least ${max} entries`);
if (process.argv.includes("-ns")) return;

let entry = 0;

// helper function calculate the correct unique ID for the files in the dataset
function calcId(x) {
    if (x % 6 == 0 || x % 6 == 1) return Math.floor(x / 6);
    return x - 2 * (Math.floor(x / 6) + 1);
}

if (fs.existsSync(Path.join(path, "sorted"))) fs.unlinkSync(Path.join(path, "sorted"));
fs.mkdirSync(Path.join(path, "sorted"));
fs.mkdirSync(Path.join(path, "sorted", "train"));
fs.mkdirSync(Path.join(path, "sorted", "val"));
fs.mkdirSync(Path.join(path, "sorted", "test"));

// sort paths
paths.forEach(p => {
    let _paths = fs.readdirSync(Path.join(path, p));
    if (_paths.length < max) return; // if folder does not contain enough files, don't include
    let __paths = _paths.slice(); // copy array by value
    for (let i = 0; i < max && i < _paths.length; i++) { // until cut-off point is reached
        // get random sample
        let index = Math.floor(Math.random() * __paths.length);
        let _p = __paths.splice(index, 1)[0]; // remove sample from set
        let _entry = entry++;
        // determine where to include the sample based on original pix2pix distribution
        if (_entry % 6 == 0) fs.copyFile(Path.join(path, p, _p), Path.join(path, "sorted", "test", `${calcId(_entry)}.png`), () => { });
        else if (_entry % 6 == 1) fs.copyFile(Path.join(path, p, _p), Path.join(path, "sorted", "val", `${calcId(_entry)}.png`), () => { });
        else fs.copyFile(Path.join(path, p, _p), Path.join(path, "sorted", "train", `${calcId(_entry)}.png`), () => { });
    }
});