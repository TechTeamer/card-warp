const cv = require('opencv4nodejs')

const DEFAULT_OPTIONS = {
  detectionRectangleWidth: 320,
  detectionRectangleHeight: 240,
  detectionWidth: 50,
  outputWidth: 500,

  cannyLowerThreshold: 100,
  cannyThresholdRatio: 3,

  houghRho: 1,
  houghTheta: Math.PI / 180,
  houghThreshold: 50
}

module.exports = class HoughTransformWarper {
  /**
   * @param {Object} [options] Default options are replaced by this
   * @param {number} [options.outputWidth] Desired width of the output image.
   * @param {number} [options.outputHeight] Desired height of the output image
   * @param {number} [options.detectionRectangleWidth] Detection rectangle width
   * @param {number} [options.detectionRectangleHeight] Detection rectangle height
   * @param {number} [options.detectionWidth] Width of the detection border regions
   */
  constructor (options = {}) {
    this.options = Object.assign({}, DEFAULT_OPTIONS, options)
  }

  /**
   * Detects a card within the detection rectangle configured in the constructor and returns a straightly-warped image of said card
   * @param {Buffer} inputBuffer Input image buffer
   * @param {Object} [_options] The default options passed in the constructor will be replaced by this parameter for the current call
   * @param {number} [_options.outputWidth] Desired width of the output image.
   * @param {number} [_options.outputHeight] Desired height of the output image
   * @param {number} [_options.detectionRectangleWidth] Detection rectangle width
   * @param {number} [_options.detectionRectangleHeight] Detection rectangle height
   * @param {number} [_options.detectionWidth] Width of the detection border regions
   * @returns {Promise<Buffer>} PNG image buffer
   */
  async getCard (inputBuffer, _options = {}) {
    let options = Object.assign({}, this.options, _options)

    if (!options.hasOwnProperty('outputHeight')) {
      options.outputHeight = Math.abs(options.outputWidth * (options.detectionRectangleHeight / options.detectionRectangleWidth))
    }

    let inputMat = await cv.imdecodeAsync(inputBuffer)
    let region = getDetectionRectangle(inputMat, options.detectionRectangleWidth, options.detectionRectangleHeight)
    let blurredRegion = await region.medianBlurAsync(1)

    let borderRegions = getDetectionBorders(blurredRegion, options.detectionWidth)

    let bestLines = {}
    let cornerPoints = {}

    let warped

    for (let borderRegion of borderRegions) {
      let edge = await borderRegion.regionMat.cannyAsync(this.options.cannyLowerThreshold, this.options.cannyLowerThreshold * this.options.cannyThresholdRatio)
      let lines = await getLines(edge, this.options.houghRho, this.options.houghTheta, this.options.houghThreshold)
      let bestLine

      if (lines.length === 0) {
        return null
      }

      bestLine = findBestLine(lines)

      switch (borderRegion.type) {
        case BorderRegion.TOP:
          bestLines.top = bestLine
          break
        case BorderRegion.LEFT:
          bestLines.left = bestLine
          break
        case BorderRegion.BOTTOM:
          bestLines.bottom = new Line(
            new cv.Point2(bestLine.p1.x, bestLine.p1.y + region.rows - options.detectionWidth),
            new cv.Point2(bestLine.p2.x, bestLine.p2.y + region.rows - options.detectionWidth),
            bestLine.slope
          )
          break
        case BorderRegion.RIGHT:
          bestLines.right = new Line(
            new cv.Point2(bestLine.p1.x + region.cols - options.detectionWidth, bestLine.p1.y),
            new cv.Point2(bestLine.p2.x + region.cols - options.detectionWidth, bestLine.p2.y),
            bestLine.slope
          )
          break
      }
    }

    if (!(bestLines.top && bestLines.left && bestLines.bottom && bestLines.right)) {
      return null
    }

    cornerPoints.topLeft = findIntersection(bestLines.top, bestLines.left)
    cornerPoints.topRight = findIntersection(bestLines.top, bestLines.right)
    cornerPoints.bottomLeft = findIntersection(bestLines.bottom, bestLines.left)
    cornerPoints.bottomRight = findIntersection(bestLines.bottom, bestLines.right)

    for (let points of [ cornerPoints.topLeft, cornerPoints.topRight, cornerPoints.bottomLeft, cornerPoints.bottomRight ]) {
      if (points.x === 0 || points.y === 0) {
        return null
      }
    }

    warped = await warp(region, cornerPoints, options.outputWidth, options.outputHeight)

    return cv.imencodeAsync('.png', warped)
  }
}

/**
 * Applies Hough transform in order to find lines on a provided edged input Mat
 * @param {Mat} edgesMat Edged input Mat
 * @param {number} houghRho Rho applied to Hough Transform
 * @param {number} houghTheta Theta applied to Hough Transform
 * @param {number} houghThreshold Threshold applied to Hough Transform
 * @returns {Promise<Line[]>} Array of lines
 */
async function getLines (edgesMat, houghRho, houghTheta, houghThreshold) {
  let hough = await edgesMat.houghLinesAsync(houghRho, houghTheta, houghThreshold)

  return hough.map(line => {
    let rho = line.x
    let theta = line.y
    let a = Math.cos(theta)
    let b = Math.sin(theta)
    let x0 = a * rho
    let y0 = b * rho

    let p1 = new cv.Point2(Math.round(x0 + 1000 * (-b)), Math.round(y0 + 1000 * a))
    let p2 = new cv.Point2(Math.round(x0 - 1000 * (-b)), Math.round(y0 - 1000 * a))

    return new Line(p1, p2)
  })
}

/**
 * Finds the two lines in the array with the smallest slope difference and returns their average
 * @param {Line[]} lines
 */
function findBestLine (lines) {
  let minSlopeDiff
  let minDiffLines

  for (let line1 of lines) {
    for (let line2 of lines) {
      let slopeDiff = line1.slope - line2.slope

      if (slopeDiff === 0) {
        continue
      }

      if (!minSlopeDiff || slopeDiff < minSlopeDiff) {
        minSlopeDiff = slopeDiff
        minDiffLines = [ line1, line2 ]
      }
    }
  }

  if (!minDiffLines) {
    minDiffLines = [ lines[0], lines[0] ]
  }

  return lineAverage(minDiffLines[0], minDiffLines[1])
}

/**
 * Get the detection rectangle of an input Mat
 * @param {Mat} inputMat
 * @param {number} detectionRectangleWidth
 * @param {number} detectionRectangleHeight
 * @returns {Mat}
 */
function getDetectionRectangle (inputMat, detectionRectangleWidth, detectionRectangleHeight) {
  let detRectX = (inputMat.cols - detectionRectangleWidth) / 2
  let detRectY = (inputMat.rows - detectionRectangleHeight) / 2

  let region = inputMat.getRegion(new cv.Rect(
    detRectX,
    detRectY,
    detectionRectangleWidth,
    detectionRectangleHeight
  ))

  return region
}

/**
 * Finds the intersection of two lines and returns the point
 * @param {Line} line1
 * @param {Line} line2
 * @return Point2
 */
function findIntersection (line1, line2) {
  let x1 = line1.p1.x
  let x2 = line1.p2.x
  let x3 = line2.p1.x
  let x4 = line2.p2.x

  let y1 = line1.p1.y
  let y2 = line1.p2.y
  let y3 = line2.p1.y
  let y4 = line2.p2.y

  let u = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / ((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1))

  return new cv.Point2(x1 + u * (x2 - x1), y1 + u * (y2 - y1))
}

/**
 * Creates an average line from multiple lines
 * @param {Line} lines
 * @returns {Line}
 */
function lineAverage (...lines) {
  let sumX1 = 0
  let sumY1 = 0
  let sumX2 = 0
  let sumY2 = 0

  for (let line of lines) {
    sumX1 += line.p1.x
    sumX2 += line.p2.x
    sumY1 += line.p1.y
    sumY2 += line.p2.y
  }

  return new Line(
    new cv.Point2(Math.round(sumX1 / lines.length), Math.round(sumY1 / lines.length)),
    new cv.Point2(Math.round(sumX2 / lines.length), Math.round(sumY2 / lines.length))
  )
}

/**
 * Gets the detection borders of an input Mat
 * @param {Mat} inputMat
 * @param {number} detectionWidth
 * @returns {BorderRegion[]}
 */
function getDetectionBorders (inputMat, detectionWidth) {
  let top = inputMat.getRegion(new cv.Rect(
    0,
    0,
    inputMat.cols,
    detectionWidth
  ))

  let bottom = inputMat.getRegion(new cv.Rect(
    0,
    inputMat.rows - detectionWidth,
    inputMat.cols,
    detectionWidth
  ))

  let left = inputMat.getRegion(new cv.Rect(
    0,
    0,
    detectionWidth,
    inputMat.rows
  ))

  let right = inputMat.getRegion(new cv.Rect(
    inputMat.cols - detectionWidth,
    0,
    detectionWidth,
    inputMat.rows
  ))

  return [
    new BorderRegion(top, BorderRegion.TOP),
    new BorderRegion(left, BorderRegion.LEFT),
    new BorderRegion(bottom, BorderRegion.BOTTOM),
    new BorderRegion(right, BorderRegion.RIGHT)
  ]
}

/**
 * Warps four points on a Mat to form a rectangle
 * @param {Mat} inputMat Input Mat that should be warped
 * @param {{topLeft: Point2, topRight: Point2, bottomRight: Point2, bottomLeft: Point2}} cornerPoints Points on the Mat
 * @param {number} width Width of the returned image
 * @param {number} height Height of the returned image
 * @returns {Promise<Mat>}
 */
async function warp (inputMat, cornerPoints, width, height) {
  let trans = cv.getPerspectiveTransform([
    cornerPoints.topLeft,
    cornerPoints.topRight,
    cornerPoints.bottomRight,
    cornerPoints.bottomLeft
  ], [
    new cv.Point2(0, 0),
    new cv.Point2(width, 0),
    new cv.Point2(width, height),
    new cv.Point2(0, height)
  ])

  let warped = await inputMat.warpPerspectiveAsync(trans, new cv.Size(width, height))

  return warped
}

class Line {
  /**
   * Constructs a new Line instance
   * @param p1 First point of the line
   * @param p2 Second point of the line
   * @param slope Slope of the line. If null, the slope will be calculated.
   */
  constructor (p1, p2, slope = null) {
    this.p1 = p1
    this.p2 = p2

    if (!slope) {
      if (p1.x - p2.x < p1.y - p2.y) { // Horizontal
        this.slope = Math.abs((p1.y - p2.y) / (p1.x - p2.x))
      } else { // Vertical
        this.slope = Math.abs((p1.x - p2.x) / (p1.y - p2.y))
      }
    } else this.slope = slope
  }
}

class BorderRegion {
  static get TOP () { return 1 }
  static get LEFT () { return 2 }
  static get BOTTOM () { return 3 }
  static get RIGHT () { return 4 }

  /**
   * Constructs a new border region to detect lines in
   * @param {Mat} regionMat Mat of the region
   * @param {number} type Either one of BorderRegion::TOP, BorderRegion::LEFT, BorderRegion::BOTTOM or BorderRegion::RIGHT
   */
  constructor (regionMat, type) {
    this.regionMat = regionMat
    this.type = type
  }
}
