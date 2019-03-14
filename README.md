# Card Warp

This is a library used to detect a card on a picture and warp it in order to generate an image of a perfectly straight, horizontal image of a card, that can be processed further by an OCR.

This functionality is achieved using opencv. Two algorithms are implemented: One that uses feature matching algorithms to detect a card, and one that uses Canny edge detection combined with a Hough transform to find a card.

## Comparison

### Feature Matching

This method searches "interesting points" (features) in a reference image of a card that only contains features that remain constant over all cards.

This step is repeated for the actual image on which a card should be detected. Afterwards, an algorithm tries to find a homography between the two sets of features.

If enough features on the input image match the reference image, the borders and corner points of the card can be calculated from their arrangement.  

**Pros:**
- The card can be held in very weird positions and still be recognized
- Can detect a card anywhere in the picture
- Only a card is detected that actually matches the reference image
- Very precise detection if enough features are present

**Cons:**
- Uniform cards not containing enough features are rarely detected
- Requires reference images
- Can not detect any type of card
- Slower & consumes much more resources than Hough Transform

### Hough Transform

This method only searches in the border regions of a rectangle of a given size in the center of the picture, which makes it a lot faster than Feature Matching.

There are four rectangular regions at the four borders of the detection rectangle which the detection algorithm takes place in.

Each of these regions gets edged using Canny, and a Hough Transform applied on the result.

From the lines returned by Hough the best line is calculated, so the result is exactly one line for each region.

Four corner points are then by determined by calculating the intersections of said lines. 

**Pros:**
- Can detect any type of card out of the box
- Can detect very homogeneous cards as well
- Very fast and resource efficient

**Cons:**
- Card has to be in the detection rectangle and must not be tilted excessively
- Might in rare cases misinterpret lines on or above the card as the cards border
- No restriction for the card type possible

## Install

- `npm install card-warp`

## Usage

### Feature Matching

#### Reference image

The reference image is an image of the card, that should be matched, with everything, that changes over different cards, either blurred out, or removed, while everything, that stays the same, left in it.
Blurring works, because it removes sharp edges, which would otherwise be detected by the feature detection algorithm.
 
The feature detection algorithm detects edges, so if there are edges on the reference image, that might not occur on the image, that should be matched, the output will be less accurate.

For instance, on an ID card, the face, name and other personal data should be removed, while labels like the country name, or the field descriptions should be left in.

**Example:**

![Example Reference Image](test/feature-matcher/images/reference.jpg)

#### How to use in a project

Use `FeatureMatcher::generateDescriptors` to generate descriptors for a reference image that should be matched.

An image buffer together with the descriptors are then piped into `FeatureMatcher#getCard` to generate an image of a straight, horizontal card.

The result is a Promise resolving in an object with the key `card` being a buffer of the generated image as well as the key `probability` being a probability whether the result is actually a card.

The probability is the quotient of the number of found points matching the geometric model and the total number of found points. Have a look at the source code for more information.

**Example:**

```javascript
const fs = require('fs')
const FeatureMatcher = require('@techteamer/card-warp').FeatureMatcherWarper

let detector = new FeatureMatcher()
let descriptors = detector.generateDescriptors('features/id_new.jpg')

detector.getCard(fs.readFileSync('input.jpg'), descriptors)
  .then(obj => {
    if (obj === false)
      return console.log('No card found')

    console.log('Probability:', (obj.probability * 100).toFixed(2) + '%')

    fs.writeFileSync('output.png', obj.card)
  })
```

#### Demo examples

Each directory in `./test/images` contains the test images as well as an image of the expected result (`result.jpg`).

`./test/images/reference.jpg` is a reference image of the sample card that will be matched in the test images.

`docker-compose up test` tests each image, checks if it is similar enough to the expected result as well as generates a `graph-*.jpg` for each tested image.
The graph is an image that shows similarities between the expected result and the actual result, so a human can take a look at the output as well.

### Hough Transform

#### How to use in a project

Feed `HoughTransform#getCard` with an image buffer in order to generate an image of a straight, horizontal card.

The result is a Promise resolving in a buffer of the generated image.

**Example:**

```javascript
const fs = require('fs')
const HoughTransform = require('@techteamer/card-warp').HoughTransformWarper

let detector = new HoughTransform({
  "detectionRectangleWidth": 450,
  "detectionRectangleHeight": 300,
  "detectionWidth": 50
})

detector.getCard(fs.readFileSync('input.jpg'))
  .then(cardBuffer => {
    fs.writeFileSync('output.png', cardBuffer)
  })
```

#### Demo

- `npm install`
- `cd test/hough-transform`
- `node test`

The results can be found in `test/hough-transform/output`.

## API

### `FeatureMatcherWarper`

This is the only class this library exposes and it's used to generate feature descriptors as well as detect a card on an input image, warp it and output a straight image of said card.

#### `#generateDescriptors (path, downscaleWidth = 1000): Promise<Object>`

**Parameters:**
- `path: string`: The path to the image on the local filesystem
- `downscaleWidth: number`: The width images should be downscaled to if they exceed it

This function generates and returns corners, key points and features descriptors of an image.
It is separate, so this function can be run once at the application startup for every reference image, without having to re-generate the same descriptors every time an image is matched.

#### `#getCard (inputBuffer, reference, outputWidth = 500): Promise<Buffer>`

**Parameters:**
- `inputBuffer: Buffer`: The input image as a buffer
- `reference: Object`: The descriptors acquired by `FeatureMatcherWarper#generateDescriptors`
- `outputWidth: number`: The desired width of the output image

This function detects and warps an output image based on the reference descriptors and returns a buffer of the warped card as PNG.

### `HoughTransformWarper`

#### `constructor (options = {})`

**Options:**

```javascript
options = {
  detectionRectangleWidth: 320,   // Default width of the detection rectangle
  detectionRectangleHeight: 240,  // Default height of the detection rectangle
  detectionWidth: 50,             // Default width of the detection border regions

  /*
   * Do not set these options if you don't know what you're doing.
   * It might mess things up.
   */
  cannyLowerThreshold: 150,       // Lower threshold applied to Canny
  cannyThresholdRatio: 3,         // higherThreshold = cannyLowerThershold * cannyThresholdRatio

  houghRho: 1,                    // Rho applied to Hough Transform
  houghTheta: Math.PI / 180,      // Theta applied to Hough Transform
  houghThreshold: 75              // Threshold applied to Hough Transform
}
```

> Any missing key in the options will be replaced by the default options above.

#### `#getCard (options = {}): Promise<Buffer>`

 **Parameters:**
 - `inputBuffer: Buffer`: The input image as a buffer
 - *`_options: Object`: The default options passed in the constructor will be replaced by this parameter for the current call*
 - *`_options.outputWidth: number`: Desired width of the output image*
 - *`_options.outputHeight: number`: Desired height of the output image*
 - *`_options.detectionRectangleWidth: number`: Detection rectangle width*
 - *`_options.detectionRectangleHeight: number`: Detection rectangle height*
 - *`_options.detectionWidth: number`: Width of the detection border regions*

This function detects and warps an output image based on the reference descriptors and returns a buffer of the warped card as PNG.
