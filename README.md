# Card Warp

This is a library used to detect a card on a picture and warp it in order to generate an image of a perfectly straight, horizontal image of a card, that can be processed further by an OCR.

This functionality is achieved by matching features using opencv.

## Requirements

- Empty template of the card on the local disk, perfectly cropped and straight *([Example](./test/images/reference.jpg))*
    - Every feature removed that changes on each card while every feature left on it that stays the same
- opencv built with `xfeatures2d`

## Install

- `npm install card-warp`

## Usage

### Reference images

The reference image is an image of the card, that should be matched, with everything, that changes over different cards, either blurred out, or removed, while everything, that stays the same, left in it.
Blurring works, because it removes sharp edges, which would otherwise be detected by the feature detection algorithm.
 
The feature detection algorithm detects edges, so if there are edges on the reference image, that might not occur on the image, that should be matched, the output will be less accurate.

For instance, on an ID card, the face, name and other personal data should be removed, while labels like the country name, or the field descriptions should be left in.

**Example:**

![Example Reference Image](./test/images/reference.jpg)

### How to use in a project

The module exposes a `CardWarp` class. You can use `CardWarp::generateDescriptors` to generate descriptors for a reference image that should be matched.

An image buffer together with the descriptors are then piped into `CardWarp#getCard` to generate an image of a straight, horizontal card.

The result is a Promise resolving in an object with the key `card` being a buffer of the generated image as well as the key `probability` being a probability whether the result is actually a card.

The probability is the quotient of the number of found points matching the geometric model and the total number of found points. Have a look at the source code for more information.

**Example:**

```javascript
const fs = require('fs')
const CardWarp = require('./CardWarp')

let detector = new CardWarp()
let descriptors = detector.generateDescriptors('features/id_new.jpg')

detector.getCard(fs.readFileSync('input.jpg'), descriptors)
  .then(obj => {
    if (obj === false)
      return console.log('No card found')

    console.log('Probability:', (obj.probability * 100).toFixed(2) + '%')

    fs.writeFileSync('output.png', obj.card)
  })
```

### Demo examples

Each directory in `./test/images` contains the test images as well as an image of the expected result (`result.jpg`).

`./test/images/reference.jpg` is a reference image of the sample card that will be matched in the test images.

`docker-compose up test` tests each image, checks if it is similar enough to the expected result as well as generates a `graph-*.jpg` for each tested image.
The graph is an image that shows similarities between the expected result and the actual result, so a human can take a look at the output as well.

## API

### `CardWarp`

This is the only class this library exposes and it's used to generate feature descriptors as well as detect a card on an input image, warp it and output a straight image of said card.

#### `CardWarp#generateDescriptors (path, downscaleWidth = 1000): Promise<Object>`

**Parameters:**

- `path: string`: The path to the image on the local filesystem
- `downscaleWidth: number`: The width images should be downscaled to if they exceed it

This function generates and returns corners, key points and features descriptors of an image.
It is separate, so this function can be run once at the application startup for every reference image, without having to re-generate the same descriptors every time an image is matched.

#### `CardWarp#getCard (inputBuffer, reference, outputWidth = 500): Promise<Buffer>`

**Parameters:**

- `inputBuffer: Buffer`: The input image as a buffer
- `reference: Object`: The descriptors acquired by `CardWarp#generateDescriptors`
- `outputWidth: number`: The desired width of the output image

This function detects and warps an output image based on the reference descriptors and returns a buffer of the warped card as PNG.
