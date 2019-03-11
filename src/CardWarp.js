const sharp = require('sharp')
const cv = require('opencv4nodejs')

module.exports = class CardWarp {
  /**
   * Initiates the card detector.
   */
  constructor () {
    this.detector = new cv.SIFTDetector({nFeatures: 4000})
  }

  /**
   * Detects a card on a given image
   * @param inputBuffer Input image buffer
   * @param reference The descriptors of the reference image, acquired by CardWarp::generateDescriptors
   * @param outputWidth Width of the output picture
   * @returns {Image} Returns an Image instance
   */
  async getCard (inputBuffer, reference, outputWidth = 500) {
    let inputMat = await cv.imdecodeAsync(inputBuffer)

    let {
      image: referenceImage,
      corners: referenceCorners,
      keyPoints: referenceKeyPoints,
      descriptors: referenceDescriptors
    } = reference

    let inputKeyPoints = await this.detector.detectAsync(inputMat)
    let inputDescriptors = await this.detector.computeAsync(inputMat, inputKeyPoints)

    let rawMatches

    let referencePoints = []
    let inputPoints = []

    let homography
    let mask

    let cardPointsMat
    let cardPoints = []

    let inliers = 0

    let warped
    let warpColorCorrected

    if (inputDescriptors.rows === 0)
      return false

    rawMatches = await cv.matchKnnFlannBasedAsync(referenceDescriptors, inputDescriptors, 2)

    for (let match of rawMatches) {
      if (match.length === 2 && match[0].distance < match[1].distance * .75) {
        let m = match[0]

        referencePoints.push(referenceKeyPoints[m.queryIdx].point)
        inputPoints.push(inputKeyPoints[m.trainIdx].point)
      }
    }

    ({ homography, mask } = cv.findHomography(referencePoints, inputPoints, cv.RANSAC, 4))

    for (let i = 0; i < inputPoints.length; i++)
      if (mask.at(i, 0) === 1)
        inliers++

    if (homography.cols !== 3)
      return false

    cardPointsMat = await referenceCorners.perspectiveTransformAsync(homography)

    for (let r = 0; r < cardPointsMat.rows; r++)
      for (let c = 0; c < cardPointsMat.cols; c++)
        cardPoints.push(new cv.Point2(cardPointsMat.at(r, c).x, cardPointsMat.at(r, c).y))

    warped = await warp(inputMat, cardPoints, outputWidth, ~~((outputWidth / referenceImage.cols) * referenceImage.rows))
    warpColorCorrected = await colorCorrect(warped)

    return {
      card: await gammaCorrect(cv.imencode('.png', warpColorCorrected)),
      probability: inliers / inputPoints.length
    }
  }

  /**
   * Generates corners, key points and feature descriptors of an image
   * @param path The path to the image on the local filesystem
   * @param downscaleWidth The width images should be downscaled to if they exceed it
   * @returns {Object} An object containing the corners, key points and feature descriptors of the reference images
   */
  async generateDescriptors (path, downscaleWidth = 1000) {
    let image = await cv.imreadAsync(path)

    let corners
    let keyPoints
    let descriptors

    if (image.cols > downscaleWidth)
      image = await image.resizeAsync(~~(downscaleWidth / image.cols * image.rows), downscaleWidth)

    corners = new cv.Mat([[
      [0, 0, 1],
      [image.cols, 0, 1],
      [image.cols, image.rows, 1],
      [0, image.rows, 1]
    ]], cv.CV_32FC2)

    keyPoints = await this.detector.detectAsync(image)
    descriptors = await this.detector.computeAsync(image, keyPoints)

    return {
      image,
      corners,
      keyPoints,
      descriptors
    }
  }

  /**
   * Generates corners, key points and feature descriptors of an image synchronously
   * @param path The path to the image on the local filesystem
   * @param downscaleWidth The width images should be downscaled to if they exceed it
   * @returns {Object} An object containing the corners, key points and feature descriptors of the reference images
   */
  generateDescriptorsSync (path, downscaleWidth = 1000) {
    let image = cv.imread(path)

    let corners
    let keyPoints
    let descriptors

    if (image.cols > downscaleWidth)
      image = image.resize(~~(downscaleWidth / image.cols * image.rows), downscaleWidth)

    corners = new cv.Mat([[
      [0, 0, 1],
      [image.cols, 0, 1],
      [image.cols, image.rows, 1],
      [0, image.rows, 1]
    ]], cv.CV_32FC2)

    keyPoints = this.detector.detect(image)
    descriptors = this.detector.compute(image, keyPoints)

    return {
      image,
      corners,
      keyPoints,
      descriptors
    }
  }
}

/**
 * Color-corrects a Mat
 * TODO: Make this better
 * @param inputMat Input Mat
 * @returns {Promise<Mat>}
 */
async function colorCorrect (inputMat) {
  let gray = inputMat.cvtColor(cv.COLOR_BGR2GRAY)

  let histogram = cv.calcHist(gray, [{
    channel: 0,
    bins: 256,
    ranges: [ 0, 256 ]
  }])

  let accumulator = []

  accumulator.push(histogram.at(0, 0))

  for (let i = 1; i < 256; i++) {
    accumulator.push(accumulator[i - 1] + histogram.at(i, 0))
  }

  let max = accumulator[accumulator.length - 1]

  let minGray = 0
  while (accumulator[minGray] < 1)
    minGray++

  let maxGray = 255
  while (accumulator[maxGray] >= (max - 1))
    maxGray--

  let inputRange = maxGray - minGray
  let alpha = 255 / inputRange
  let beta = -minGray * alpha

  let result = inputMat.convertTo(-1, alpha, beta + (Math.abs(beta) * 1.5))

  return result
}

/**
 * Gamma corrects an input buffer using sharp
 * @param inputBuffer
 * @returns {Promise<Buffer>}
 */
async function gammaCorrect (inputBuffer) {
  return await sharp(inputBuffer).gamma(3, 3).toBuffer()
}

/**
 * Warps four points on a Mat to form a rectangle
 * @param inputMat Input Mat that should be warped
 * @param points Points on the Mat
 * @param width Width of the returned image
 * @param height Height of the returned image
 * @returns {Promise<Mat>}
 */
async function warp (inputMat, points, width, height) {
  let trans = cv.getPerspectiveTransform(points, [
    new cv.Point2(0, 0),
    new cv.Point2(width, 0),
    new cv.Point2(width, height),
    new cv.Point2(0, height)
  ])

  return await inputMat.warpPerspectiveAsync(trans, new cv.Size(width, height))
}
