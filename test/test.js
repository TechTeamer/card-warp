const sharp = require('sharp')
const cv = require('opencv4nodejs')
const expect = require('chai').expect
const path = require('path')
const fs = require('fs')

const CardWarp = require('../CardWarp')

let cardWarp = new CardWarp()
let resultGraphs = []

describeDir('New ID (front)', 'test/images/id_new')
describeDir('New ID (back)', 'test/images/id_new_back')
describeDir('Old ID (front)', 'test/images/id_old')
describeDir('Old ID (back)', 'test/images/id_old_back')
describeDir('Passport', 'test/images/passport')

function describeDir (name, dir) {
  describe(name, function () {
    let { resultDescriptors, images } = readDir(dir)
    let graphs = []

    if (resultDescriptors === false)
      return console.log(`Skipping ${dir} because it does not contain a 'result.jpg'...`)

    for (let image of images) {
      let card

      before(function (done) {
        cardWarp.getCard(image.buffer, resultDescriptors)
          .then(c => {
            card = c
            done()
          })
      })

      describe(image.name, function () {
        it('should result in a probability above 40%', function () {
          expect(card.probability).to.be.above(0.4)
        })

        it('should have a similarity above 40%', async function () {
          let { similarity, graph } = await checkSimilarities(card.card, resultDescriptors)

          graphs.push(graph)

          expect(similarity).to.be.above(0.4)
        })
      })
    }

    after(function () {
      let maxWidth = graphs.reduce((a, v) => v.cols < a ? a : v.cols, 0)
      let height = graphs.reduce((a, v) => a + v.rows, 0)

      let resultMat = new cv.Mat(height, maxWidth, cv.CV_8UC3, [0, 0, 0])

      let top = 0

      for (let graph of graphs) {
        graph.copyTo(resultMat.getRegion(new cv.Rect(0, top, graph.cols, graph.rows)))

        top += graph.rows
      }

      resultGraphs.push(resultMat)
    })
  })
}

after(function () {
  console.log('Generating result graphics...')
  this.timeout(20000)

  let maxHeight = resultGraphs.reduce((a, v) => v.rows < a ? a : v.rows, 0)
  let width = resultGraphs.reduce((a, v) => a + v.cols, 0)

  let resultMat = new cv.Mat(maxHeight, width, cv.CV_8UC3, [0, 0, 0])

  let left = 0

  for (let graphs of resultGraphs) {
    graphs.copyTo(resultMat.getRegion(new cv.Rect(left, 0, graphs.cols, graphs.rows)))

    left += graphs.cols
  }

  cv.imwrite('test/graph.jpg', resultMat)
})

async function checkSimilarities (inputBuffer, result) {
  let detector = cardWarp.getDetector()
  let inputMat = await cv.imdecodeAsync(inputBuffer)

  let {
    image: resultImage,
    keyPoints: resultKeyPoints,
    descriptors: resultDescriptors
  } = result

  let inputKeyPoints = await detector.detectAsync(inputMat)
  let inputDescriptors = await detector.computeAsync(inputMat, inputKeyPoints)

  if (inputDescriptors.rows === 0)
    return {
      similarity: 0
    }

  let rawMatches = await cv.matchKnnFlannBasedAsync(resultDescriptors, inputDescriptors, 2)
  let goodMatches = []

  let resultPoints = []
  let inputPoints = []

  let graph

  let inliers = 0

  for (let match of rawMatches)
    if (match.length === 2 && match[0].distance < match[1].distance * .75) {
      goodMatches.push(match[0])

      resultPoints.push(resultKeyPoints[match[0].queryIdx].point)
      inputPoints.push(inputKeyPoints[match[0].trainIdx].point)
    }

  let sortedMatches = goodMatches
    .sort((m1, m2) => m1.distance - m2.distance)
    .slice(0, 100)

  graph = cv.drawMatches(resultImage, inputMat, resultKeyPoints, inputKeyPoints, sortedMatches)

  ;({ homography, mask } = cv.findHomography(resultPoints, inputPoints, cv.RANSAC, 4))

  for (let i = 0; i < inputPoints.length; i++) {
    if (mask.at(i, 0) === 1) {
      inliers++
    }
  }

  return {
    similarity: inliers / inputPoints.length,
    graph
  }
}

function readDir (dir) {
  let files = fs.readdirSync(dir).filter(fileName => path.extname(fileName) === '.jpg')
  let result = {}

  if (!files.includes('result.jpg'))
    return { resultDescriptors: false, images: false}

  result.resultDescriptors = CardWarp.generateDescriptors(path.resolve(dir, 'result.jpg'), cardWarp.getDetector())
  result.images = files
    .filter(fileName => fileName !== 'result.jpg' && fileName !== 'graph.jpg')
    .map(name => ({
      name: path.basename(name, '.jpg'),
      buffer: fs.readFileSync(path.resolve(dir, name))
    }))

  return result
}