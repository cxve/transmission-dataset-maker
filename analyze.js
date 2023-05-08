/*
    Analyze the results of a model to determine model performance.
    Various metrics are evaluated and saved into a csv file in the same folder, overwriting previous csv files.
    Use /path/to/implementation/checkpoints/modelname/web/images folder to analyze training performance.
    Use /path/to/implementation/results/modelname/test_latest/images folder to analze test results.
    Built for this implementation of pix2pix: https://github.com/junyanz/pytorch-CycleGAN-and-pix2pix
    
    Epoch: Training epoch or numerical ID for test results.
    Changes Cells: How many 4x4 pixel blocks have changes.
    Changes Cells Right: How many 4x4 pixel blocks were changed completely correctly.
    Changes Cells Wrong: How many 4x4 pixel blocks were changed wrongfully.
    Changes Charges: How many pixel have changes.
    Changes Charges Right: How many pixels were changed correctly.
    Changes Charges Wrong: How many pixels were changed incorrectly.
    
    Please note! 
        Wrong means the model made changes to pixels that were not meant to be changed.
        To calculate missing changes, calculate "changes" - "changes right".
*/

const Jimp = require('jimp');
const fs = require('fs');
const Path = require('node:path');

// print syntax help
if (process.argv.length < 3) {
    console.log(`\nSyntax: node analyze <path>\n`);
    return;
}

// check if color f is in range of color b
// f is in range if R G and B are no more than 60 off from b's RGB
function rangeCheck(b, f) {
    return Math.abs(Math.floor(b / (256 * 256 * 256)) - Math.floor(f / (256 * 256 * 256))) < 60
        && Math.abs((Math.floor(b / (256 * 256)) % 256) - (Math.floor(f / (256 * 256)) % 256)) < 60
        && Math.abs((Math.floor(b / 256) % 256) - (Math.floor(f / 256) % 256)) < 60;
}

// wrapped main in function, to allow for awaits
async function main() {
    let csv = "epoch,changesCells,changesCellsRight,changesCellsWrong,changesCharges,changesChargesRight,changesChargesWrong\n";
    // get normalized paths of all files
    let paths = [... new Set(fs.readdirSync(process.argv[2]).map(s => s.split("_")[0]))];
    for (let i = 0; i < paths.length; ++i) { // for every file
        console.log(`processing ${paths[i]} as ${i}`);
        // load images
        let path = Path.join(process.argv[2], paths[i]);
        let a = await Jimp.read(path + "_real_A.png");
        let b = await Jimp.read(path + "_real_B.png");
        let f = await Jimp.read(path + "_fake_B.png");

        // compare in original size
        a.scaleToFit(64, 64);
        b.scaleToFit(64, 64);
        f.scaleToFit(64, 64);

        // count changes A -> B
        let changesCells = 0, changesCellsRight = 0, changesCellsWrong = 0, changesCharges = 0, changesChargesRight = 0, changesChargesWrong = 0;

        // helper function to count various charge metrics
        function detectChange(x, y) {
            // count changes in total
            if (!rangeCheck(a.getPixelColor(x, y), b.getPixelColor(x, y))) {
                changesCharges++;
                // count correct guesses f = b
                if (rangeCheck(b.getPixelColor(x, y), f.getPixelColor(x, y))) changesChargesRight++;
            }
            // count incorrect guesses
            else if (!rangeCheck(b.getPixelColor(x, y), f.getPixelColor(x, y))) changesChargesWrong++;
        }

        // for every 4x4 pixel block
        for (let y = 0; y < a.getHeight() / 4; ++y)
            for (let x = 0; x < a.getWidth() / 4; ++x) {
                // remember state
                let _changesCharges = changesCharges;
                let _changesChargesRight = changesChargesRight;
                let _changesChargesWrong = changesChargesWrong;

                // detect changes
                detectChange(x * 4 + 1, y * 4);
                detectChange(x * 4 + 2, y * 4 + 1);
                detectChange(x * 4 + 1, y * 4 + 2);
                detectChange(x * 4, y * 4 + 1);

                // detect state changes
                // if charges increased, a 4x4 pixel block has changed
                if (_changesCharges != changesCharges) {
                    changesCells++;
                    // if changes made match correct changes made, the 4x4 pixel block was changed perfectly
                    if (changesCharges - _changesCharges == changesChargesRight - _changesChargesRight)
                        changesCellsRight++;
                    // if charges did not increase, but mistakes increased, a 4x4 pixel block was wrongfully changed
                } else if (changesChargesWrong != _changesChargesWrong)
                    changesCellsWrong++;
            }

        // save row
        csv += [i, changesCells, changesCellsRight, changesCellsWrong, changesCharges, changesChargesRight, changesChargesWrong].join(",") + "\n";
    }
    // save file
    fs.writeFileSync(Path.basename(process.argv[2]) + ".csv", csv);
}
main();