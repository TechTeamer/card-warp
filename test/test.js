const fs = require('fs')
const test = require('ava')
const path = require('path')
const cv = require('opencv4nodejs')
const CardWarp = require('../src/CardWarp')

let cardWarp = new CardWarp()

let referenceDescriptors
let resultGraphs = []

test.before('Generate Descriptors', async () => {
  referenceDescriptors = await cardWarp.generateDescriptors(path.resolve('test/images/reference.jpg'))
})

for (let name of [ 'Emerson Allen', 'Jonathan Pelchat', 'Joshua Gould' ]) {
  let samplePath = path.join(path.resolve('test/images'), name.toLowerCase().split(' ').join('-'))
  let graphs = []

  test(name, async t => {
    let { resultDescriptors, images } = await readDir(samplePath)

    for (let { name, buffer } of images) {
      let card = await cardWarp.getCard(buffer, referenceDescriptors)

      t.is(card.probability > 0.4, true, `Probability of ${name} greater than 0.4`)

      let { similarity, graph } = await checkSimilarities(card.card, resultDescriptors)

      t.is(similarity > 0.4, true, `Similarity of ${name} and result.jpg greater than 0.4`)

      cv.imwrite(path.join(samplePath, `graph-${name}`), graph)
    }
  })

  resultGraphs.push(graphs)
}

async function readDir (dir) {
  let files = fs.readdirSync(dir).filter(fileName => path.extname(fileName) === '.jpg' && !fileName.startsWith('graph-'))
  let result = {}

  if (!files.includes('result.jpg'))
    return { resultDescriptors: false, images: false}

  result.resultDescriptors = await cardWarp.generateDescriptors(path.resolve(dir, 'result.jpg'))
  result.images = files
    .filter(fileName => fileName !== 'result.jpg')
    .map(name => ({
      name,
      buffer: fs.readFileSync(path.resolve(dir, name))
    }))

  return result
}

async function checkSimilarities (inputBuffer, result) {
  let detector = new cv.SIFTDetector({nFeatures: 4000})
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

  let homography
  let mask

  let inliers = 0

  for (let match of rawMatches)
    if (match.length === 2 && match[0].distance < match[1].distance * .75) {
      goodMatches.push(match[0])

      resultPoints.push(resultKeyPoints[match[0].queryIdx].point)
      inputPoints.push(inputKeyPoints[match[0].trainIdx].point)
    }

  let sortedMatches = goodMatches
    .sort((m1, m2) => m1.distance - m2.distance)
    .slice(0, 20)

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
