const fs = require('fs')
const FeatureMatcherWarper = require('../../src').FeatureMatcherWarper

/* let detector = new HoughTransformWarper({
  detectionRectangleWidth: 450,
  detectionRectangleHeight: 300,
  detectionWidth: 50
})

let detector = new HoughTransformWarper({
  detectionRectangleWidth: 460,
  detectionRectangleHeight: 290,
  detectionWidth: 50
}) */

let detector = new FeatureMatcherWarper()

async function main () {
  let idBackFeatures = await detector.generateDescriptors('new_back.png')

  if (!fs.existsSync('output')) {
    fs.mkdirSync('output')
  }

  /* for (let file of fs.readdirSync('images')) {
    let input = fs.readFileSync(`images/${file}`)
    let warped = await detector.getCard(input, idBackFeatures)

    if (!warped) {
      console.log('No card found')
      continue
    }

    fs.writeFileSync(`output/${file}`, warped)
  } */

  let input = fs.readFileSync('images/new_back.png')

  let warped = await detector.getCard(input, idBackFeatures)

  console.log(warped.probability)

  fs.writeFileSync('output/output.png', warped.card)
}

main()
