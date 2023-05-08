/*
    This file contains command line arguments.
*/

const { CTEXT, ICONS } = require('./utils');

// determine dataset canvas size
function getSize() {
    let size = getNamedArgument("-s") ?? 64; // default size
    size = Number.parseInt(size);
    // if size argument is invalid, exit
    if (Number.isNaN(size) || size < 1 || size > 1024 * 1024) { console.log(CTEXT.ERROR + ICONS.ERROR + ` invalid size argument!`); process.exit(1); }
    // print size used for execution
    console.log((size != 64 ? CTEXT.WARN + ICONS.WARN : CTEXT.INFO + ICONS.INFO) + ` size set to ${size}x${size} (final size is ${size * 2}x${size})`, CTEXT.RESET);
    return size; // return size
}

// determine dataset name
function getName() {
    let dname = getNamedArgument("-n") ?? `dataset_${Date.now()}`; // default name
    // print name used for execution
    console.log((process.argv.includes("-n") ? CTEXT.WARN + ICONS.WARN : CTEXT.INFO + ICONS.INFO) + ` dataset name set to ${dname}`, CTEXT.RESET);
    return dname; // return name
}

// determine map path
function getPath() {
    let path_maps = getNamedArgument("-m") ?? "maps"; // default path
    // check if path exists
    if (!fs.existsSync(path_maps)) { console.log(CTEXT.ERROR + ICONS.ERROR + ` invalid path argument!`); return; }
    // print path for execution
    console.log((path_maps != "maps" ? CTEXT.WARN + ICONS.WARN : CTEXT.INFO + ICONS.INFO) + ` map path set to ${path_maps}`, CTEXT.RESET);
    return path_maps; // return path
}

function getNamedArgument(name) {
    let i = process.argv.indexOf(name); // get position of -m parameter
    if (i >= 0) // if -m parameter is set
        if (++i < process.argv.length)
            return process.argv[i];
        else {
            console.log(CTEXT.ERROR + ICONS.ERROR + ` missing path argument!`);
            process.exit(1);
        }
    return null;
}

module.exports = { getSize, getName, getPath }