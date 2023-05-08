This repository contains code to generate datasets to train and benchmark a pix2pix model for predicting the outcome of a move in the game *Spread: Transmission*.

[Implementation of pix2pix](https://github.com/junyanz/pytorch-CycleGAN-and-pix2pix) | [Spread: Transmission on Steam](https://store.steampowered.com/app/1926500/Spread_Transmission/?utm_source=GitHub)

## Prerequisites

- Node.js 18 

## Getting Started
### Installation

- Clone this repo:

```bash
git clone https://github.com/cxve/transmission-dataset-maker
cd transmission-dataset-maker
```

- Install dependencies with `npm install`

### Generate a dataset for training

- Run the generate script for a specified number of simulations (e.g. 10):

```bash
node generate 10
```

- To sort the dataset by amount of iterations used to resolve the changes (flat distribution), use the `-fd` flag
  - Use the `flatdist_compiler` script, to sort the dataset for usage with the pix2pix implementation

- Use the dataset to train a pix2pix model
  - Copy the `./datasets/name/sorted/` folder to `/path/to/pix2pix/datasets/name`
  - Learn how to use the pix2pix implementation [here](https://github.com/junyanz/pytorch-CycleGAN-and-pix2pix/blob/master/README.md)

### Sort a dataset based on the changes

- Run the sort_by_changes script for a specified path (e.g. `./datasets/name`):

```bash
node sort_by_changes ./datasets/name
```

- To sort the dataset based on the relative amount of changes, use the `-%` flag

- Use the `flatdist_compiler` script, to sort the dataset for usage with the pix2pix implementation

### Compile a flat distribution dataset

- Run the flatdist_compiler script for a specified path (e.g. `./datasets/name/flatdist2`) and an optional amount of images to include (e.g. 60):

```bash
node flatdist_compiler ./datasets/name/flatdist2 60
```

- Use the dataset to train a pix2pix model
  - Copy the `./datasets/name/flatdist2/sorted/` folder to `/path/to/pix2pix/datasets/name`

### Analyze training / test results quality

- Run the analyze script for a specified path (e.g. `./results/name`):

```bash
node analyze ./results/name
```

- Results are saved as `name.csv`

### Benchmark recursive implementation

- Run the benchmark script:

```bash
node benchmark
```

- Use the dataset to benchmark a pix2pix model
    - Copy the `./datasets_test/testset_name/` folder to `/path/to/pix2pix/datasets/name/testset_name`