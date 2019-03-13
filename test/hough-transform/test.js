const fs = require('fs')
const HoughTransformWarper = require('../../src').HoughTransformWarper

let detector = new HoughTransformWarper({
  detectionRectangleWidth: 450,
  detectionRectangleHeight: 300,
  detectionWidth: 50
})

async function main () {
  if (!fs.existsSync('output')) {
    fs.mkdirSync('output')
  }

  for (let file of fs.readdirSync('images')) {
    let input = fs.readFileSync(`images/${file}`)
    let warped = await detector.getCard(input)

    if (!warped) {
      console.log('No card found')
      continue
    }

    fs.writeFileSync(`output/${file}`, warped)
  }
}

main()
