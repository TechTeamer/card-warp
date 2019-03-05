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

    const fs = require('fs')
    const CardWarp = require('./src/CardWarp')
    
    let detector = new CardWarp()
    let descriptors = CardWarp.generateDescriptors('features/id_new.jpg', detector.getDetector())
    
    detector.getCard(fs.readFileSync('input.jpg'), descriptors)
      .then(obj => {
        if (obj === false)
          return console.log('No card found')
    
        console.log('Probability:', (obj.probability * 100).toFixed(2) + '%')
    
        fs.writeFileSync('output.png', obj.card)
      })

### Docker

You can just use the provided `Dockerfile` combined with `docker-compose.yml`, it should work out of the box. You just have to create an `app.js` file calling the module.

### No docker

- Install opencv4nodejs manually
    - (`opencv4nodejs` is not inside the `package.json` because the docker container doesn't run otherwise)
- Run the code