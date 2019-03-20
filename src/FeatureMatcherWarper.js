const cv = require('opencv4nodejs')

module.exports = class FeatureMatcherWarper {
  /**
   * Initiates the card detector.
   */
  constructor () {
    this.detector = new cv.SIFTDetector({ nFeatures: 4000 })
  }

  /**
   * Detects a card on a given image
   * @param {Buffer} inputBuffer Input image buffer
   * @param {Object} reference The descriptors of the reference image, acquired by CardWarp::generateDescriptors
   * @param {number} outputWidth Width of the output picture
   * @returns {Buffer} PNG image buffer
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

    if (inputDescriptors.rows === 0) {
      return { card: null, probability: 0 }
    }

    rawMatches = await cv.matchKnnFlannBasedAsync(referenceDescriptors, inputDescriptors, 2)

    for (let match of rawMatches) {
      if (match.length === 2 && match[0].distance < match[1].distance * 0.75) {
        let m = match[0]

        referencePoints.push(referenceKeyPoints[m.queryIdx].point)
        inputPoints.push(inputKeyPoints[m.trainIdx].point)
      }
    }

    ({ homography, mask } = cv.findHomography(referencePoints, inputPoints, cv.RANSAC, 4))

    for (let i = 0; i < inputPoints.length; i++) {
      if (mask.at(i, 0) === 1) {
        inliers++
      }
    }

    if (homography.cols !== 3) {
      return { card: null, probability: 0 }
    }

    cardPointsMat = await referenceCorners.perspectiveTransformAsync(homography)

    for (let r = 0; r < cardPointsMat.rows; r++) {
      for (let c = 0; c < cardPointsMat.cols; c++) {
        cardPoints.push(new cv.Point2(cardPointsMat.at(r, c).x, cardPointsMat.at(r, c).y))
      }
    }

    warped = await warp(inputMat, cardPoints, outputWidth, ~~((outputWidth / referenceImage.cols) * referenceImage.rows))

    return {
      card: cv.imencode('.png', warped),
      probability: inliers / inputPoints.length
    }
  }

  /**
   * Generates corners, key points and feature descriptors of an image
   * @param {String} path The path to the image on the local filesystem
   * @param {number} downscaleWidth The width images should be downscaled to if they exceed it
   * @returns {Object} An object containing the corners, key points and feature descriptors of the reference images
   */
  async generateDescriptors (path, downscaleWidth = 1000) {
    let image = await cv.imreadAsync(path)

    let corners
    let keyPoints
    let descriptors

    if (image.cols > downscaleWidth) {
      image = await image.resizeAsync(~~(downscaleWidth / image.cols * image.rows), downscaleWidth)
    }

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
}

/**
 * Warps four points on a Mat to form a rectangle
 * @param {cv.Mat} inputMat Input Mat that should be warped
 * @param {cv.Point2[]} points Points on the Mat
 * @param {number} width Width of the returned image
 * @param {number} height Height of the returned image
 * @returns {Promise<cv.Mat>}
 */
async function warp (inputMat, points, width, height) {
  let trans = cv.getPerspectiveTransform(points, [
    new cv.Point2(0, 0),
    new cv.Point2(width, 0),
    new cv.Point2(width, height),
    new cv.Point2(0, height)
  ])

  let warped = await inputMat.warpPerspectiveAsync(trans, new cv.Size(width, height))

  return warped
}
