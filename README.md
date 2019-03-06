# Card Warp

This is a library used to detect a card on a picture and warp it in order to generate an image of a perfectly straight, horizontal image of a card, that can be processed further by an OCR.

This functionality is achieved by matching features using opencv.

## Requirements

- Empty template of the card on the local disk, perfectly cropped and straight
    - Every feature removed that changes on each card while every feature left on it that stays the same
- opencv built with `xfeatures2d`

## Usage

### API

The module exposes a `CardWarp` class. You can use `CardWarp::generateDescriptors` to generate descriptors for a reference image that should be matched (examples may be found in `./features`).

An image buffer together with the descriptors are then piped into `CardWarp#getCard` to generate an image of a straight, horizontal card.

The result is a Promise resolving in an object with the key `card` being a buffer of the generated image as well as the key `probability` being a probability whether the result is actually a card.

The probability is the quotient of the number of found points matching the geometric model and the total number of found points. Look at the source code for more information.

**Example:**

```javascript
const fs = require('fs')
const CardWarp = require('./CardWarp')

let detector = new CardWarp()
let descriptors = CardWarp.generateDescriptors('features/id_new.jpg', detector.getDetector())

detector.getCard(fs.readFileSync('input.jpg'), descriptors)
  .then(obj => {
    if (obj === false)
      return console.log('No card found')

    console.log('Probability:', (obj.probability * 100).toFixed(2) + '%')

    fs.writeFileSync('output.png', obj.card)
  })
```

### Run in Docker

- Remove the `opencv4nodejs` dependency from package.json
    - `opencv4nodejs` gets installed globally in the `Dockerfile`
- Create a JS file that calls the API correctly
- Edit the `warp` service in `docker-compose.yml` to run your script
- `docker-compose up warp`

### Test

Sadly, because of the nature of this application it is not quite possible to push test images to git without infringing someone's privacy.
In order to run the test, you have to create test images first.

Each directory in `./test/images` contains the test images as well as a reference image of the expected result.

The reference image has to be called `result.jpg` and it should be an image of the expected output.
For example, if you want to test against images of you holding up the front side of your ID card, `result.jpg` should be a cropped scan of said card.

The names of the other images are irrelevant. Every `.jpg` file except `result.jpg` is tested.

After inserting the images, just run `docker-compose up test`.
This will test if the output of the module for each test image is similar enough to `result.jpg`.
Directories without a `result.jpg` are skipped.

Also, a `graph.jpg` is generated in `./test/images` showing an overview of matched feature on each tested image.
