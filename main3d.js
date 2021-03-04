const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
)
const renderer = new THREE.WebGLRenderer()
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

let canvas, ctx
let animationHandle = null
let redraw = false
const width = 50
const height = 50
const FONT_SIZE = 32

const PIECE_FALL_TIME_SLOW = 1000
const PIECE_FALL_TIME_FAST = 25
const CANNON_RELOAD_TIME = 4000
const BOMB_STEP_TIME = 100
const EXPLOSION_DURATION = 300
const SPLASH_DURATION = 300

const TIME_TO_BUILD = 10 * 1000
const TIME_TO_SHOOT = 60 * 1000
const TIME_TO_COLLAPSE = 200
const TIME_TO_PREPARE = 5 * 1000

const CROSSHAIR_RADIUS = 25

const SKY = undefined
const SEA = 1
const LAND = 2
const STONE1 = 3
const STONE2 = 4
const STONE3 = 5

const blockColors = {
  [SEA]: 'royalblue',
  [LAND]: 'forestgreen',
  [STONE1]: 'gray',
  [STONE2]: 'darkgray',
  [STONE3]: 'lightgray',
}

const SHOOT = 'Attack!'
const BUILD = 'Build the castle!'
const PREPARE_TO_SHOOT = 'prepare to shoot'
const PREPARE_TO_BUILD = 'prepare to build'
const WAIT_FOR_BOMBS = 'wait for bombs'
const COLLAPSE_AFTER_BUILD = 'collapse after build'

function getTimeNow() {
  return performance.now()
}

let isDebugMode = false
let mode = BUILD
let modeStartTime = getTimeNow()

let sprites = []
const playerColors = ['purple', 'yellow']

const names = ['Player 1', 'Player 2']

const shapes = [
  [
    [
      [-1, -1],
      [0, -1],
      [-1, 0],
      [0, 0],
    ],
    [
      [-1, 0],
      [0, 0],
      [-1, 1],
      [0, 1],
    ],
    [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
    [
      [0, -1],
      [1, -1],
      [0, 0],
      [1, 0],
    ],
  ],
  [
    [
      [-2, 0],
      [-1, 0],
      [0, 0],
      [1, 0],
    ],
    [
      [0, -1],
      [0, 0],
      [0, 1],
      [0, 2],
    ],
    [
      [-1, 0],
      [0, 0],
      [1, 0],
      [2, 0],
    ],
    [
      [0, -2],
      [0, -1],
      [0, 0],
      [0, 1],
    ],
  ],
  [
    [
      [0, -1],
      [-1, 0],
      [0, 0],
      [1, 0],
    ],
    [
      [0, -1],
      [-1, 0],
      [0, 0],
      [0, 1],
    ],
    [
      [-1, 0],
      [0, 0],
      [1, 0],
      [0, 1],
    ],
    [
      [0, -1],
      [0, 0],
      [1, 0],
      [0, 1],
    ],
  ],
]

function rotate(array, rotation) {
  return array[rotation]
}

function getIslandCenter(firstPlayer) {
  return firstPlayer
    ? Math.round((width * 9) / 50)
    : width - Math.round((width * 10) / 50)
}

function generatePiece(player) {
  return {
    player: player,
    x: getIslandCenter(player === 0),
    y: height / 2,
    z: 20,
    rotation: Math.floor(Math.random() * 4),
    shape: Math.floor(Math.random() * shapes.length),
    fallTime: PIECE_FALL_TIME_SLOW,
    lastUpdated: getTimeNow(),
  }
}

function findGroundZ(x, y) {
  return map[y][x].length - 1
}

function generateCannon(player) {
  const cannonX = getIslandCenter(player === 0)
  const cannonY = height / 2
  const cannonZ = findGroundZ(cannonX, cannonY) + 1
  const crosshairX = getIslandCenter(player === 1)
  const crosshairY = height / 2
  const crosshairZ = findGroundZ(crosshairX, crosshairY)
  return {
    player,
    cannonX,
    cannonY,
    cannonZ,
    x: crosshairX,
    y: crosshairY,
    z: crosshairZ,
    timer: 0,
    reloadTime: CANNON_RELOAD_TIME,
    lastShot: getTimeNow() - CANNON_RELOAD_TIME,
  }
}

function calculateParabola(startX, startY, startZ, endX, endY, endZ) {
  const dx = endX - startX
  const dy = endY - startY
  const dz = endZ - startZ

  const dh = Math.sqrt(dx * dx + dy * dy)
  const a = 125 / (width * width)
  const b = -dz / dh - a * dh

  const xDirection = dx / dh
  const yDirection = dy / dh

  return { a, b, xDirection, yDirection }
}

function generateBomb(cannon) {
  const startX = cannon.cannonX
  const startY = cannon.cannonY
  const startZ = cannon.cannonZ + 1
  const endX = cannon.x
  const endY = cannon.y
  const endZ = cannon.z

  const { a, b, xDirection, yDirection } = calculateParabola(
    startX,
    startY,
    startZ,
    endX,
    endY,
    endZ
  )

  const timeNow = getTimeNow()
  const trajectory = calculateTrajectory(
    timeNow,
    startX,
    startY,
    startZ,
    a,
    b,
    xDirection,
    yDirection
  )

  return {
    x: startX,
    y: startY,
    z: startZ,
    startX,
    startY,
    startZ,
    xDirection,
    yDirection,
    a,
    b,
    endX,
    endY,
    endZ,
    trajectory,
    createdAt: timeNow,
  }
}

function getSign(number) {
  return number > 0 ? 1 : number < 0 ? -1 : 0
}

function calculateTrajectory(
  startTime,
  startX,
  startY,
  startZ,
  a,
  b,
  xDirection,
  yDirection
) {
  let time = BOMB_STEP_TIME
  let x = startX
  let y = startY
  let z = startZ
  const trajectory = []
  let len = 200
  let firstX, firstY, firstZ
  while (x >= 0 && x < width && z >= 0 && len-- > 0) {
    firstX = x
    firstY = y
    firstZ = z
    const { x: nextX, y: nextY, z: nextZ } = getBombPosition(
      { startX, startY, startZ, a, b, xDirection, yDirection },
      time / BOMB_STEP_TIME
    )
    time += BOMB_STEP_TIME

    while (
      len > 0 &&
      (x !== Math.round(nextX) ||
        y !== Math.round(nextY) ||
        z !== Math.round(nextZ))
    ) {
      len--

      const dx = nextX - x
      const dy = nextY - y
      const dz = nextZ - z

      const sx = getSign(dx)
      const sy = getSign(dy)
      const sz = getSign(dz)

      let isHorizontal = true
      let isRising = true
      if (Math.round(x) !== Math.round(nextX)) {
        x += sx
        isHorizontal = true
      } else if (Math.round(y) !== Math.round(nextY)) {
        y += sy
      } else if (Math.round(z) !== Math.round(nextZ)) {
        z += sz
        if (sz < 0) {
          isRising = false
        }
        isHorizontal = false
      }

      trajectory.push({
        x: x,
        y: y,
        z: z,
        time: time + startTime,
        isHorizontal,
        isRising,
        label: x + ',' + y + ',' + z + ' ' + (time % 1000),
      })
    }
  }
  return trajectory
}

function getMapBlock(map, x, y, z) {
  if (x < 0 || y < 0 || !map[y] || !map[y][x]) {
    console.warn('coordinates outside map', x, y, z)
  }
  const column = map[y][x]
  return column.length > z ? column[z] : SKY
}

function findCollision(bomb, timeNow, map) {
  const passedPoints = bomb.trajectory.filter(point => point.time < timeNow)
  return passedPoints.find(
    point => getMapBlock(map, point.x, point.y, point.z) !== SKY
  )
}

// used in debug mode to visualize trajectory
function previewBomb(bomb) {
  bomb.trajectory.forEach(point => {
    drawBlock(point.x, point.y, point.z, null, 'white')
    const { xCanvas, yCanvas, xSize, ySize } = get2DProjection(
      point.x,
      point.y,
      point.z
    )

    // ctx.strokeStyle = point.isRising
    //   ? point.isHorizontal
    //     ? 'red'
    //     : 'purple'
    //   : point.isHorizontal
    //     ? 'blue'
    //     : 'cyan'
    // ctx.beginPath()
    // ctx.arc(xCanvas + xSize / 2, yCanvas + ySize / 2, 4, 0, Math.PI * 2, true)
    // ctx.stroke()
  })
}

const map = generateMap()
let pieces = [generatePiece(0), generatePiece(1)]
let cannons = [generateCannon(0), generateCannon(1)]
let bombs = []

function get2DDistance(x1, x2, y1, y2) {
  return Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2))
}

function generateMap() {
  const map = []
  for (let y = 0; y < height; y++) {
    const row = []
    for (let x = 0; x < width; x++) {
      row[x] = [SEA]
      const distanceFromIsland1 = get2DDistance(
        x,
        (width * 3) / 16,
        y,
        height / 2
      )
      const distanceFromIsland2 = get2DDistance(
        x,
        (width * 12) / 16,
        y,
        height / 2
      )
      if (distanceFromIsland1 < width / 8 || distanceFromIsland2 < width / 8) {
        row[x].push(LAND)
      }
      if (
        distanceFromIsland1 < width / 16 ||
        distanceFromIsland2 < width / 16
      ) {
        row[x].push(LAND)
      }
    }
    map[y] = row
  }
  return map
}

function get2DProjection(x, y, z) {
  const xSize = renderer.getSize().width / width / 1.5
  const ySize = renderer.getSize().height / height / 1.1
  const xOffset = xSize / 2
  const yOffset = ySize / 2
  const xCanvas = renderer.getSize().width / 3 + x * xSize - y * xOffset
  const yCanvas = renderer.getSize().height / 3 - z * ySize + y * yOffset

  return { xCanvas, yCanvas, xSize, ySize, xOffset, yOffset }
}

const geometry = new THREE.BoxGeometry()

function drawBlock(x, y, z, fillStyle, strokeStyle = '#575757') {
  const material = new THREE.MeshBasicMaterial({ color: fillStyle })
  const cube = new THREE.Mesh(geometry, material)
  cube.position.x = x
  cube.position.y = -y
  cube.position.z = z
  scene.add(cube)
}

function drawMap(map, drawSea = false) {
  scene.clear()
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const column = map[y][x]
      for (let z = drawSea ? 0 : 1; z < column.length; z++) {
        const block = map[y][x][z]
        if (block) {
          const color = blockColors[block]
          drawBlock(x, y, z, color)
        }
      }
    }
  }
  names.forEach((name, index) => {
    ctx.fillStyle = playerColors[index]
    ctx.fillText(name, (index * canvas.width) / 2 + canvas.width / 4, 10)
  })
}

function drawPieces(pieces) {
  pieces.forEach(piece => {
    const shape = rotate(shapes[piece.shape], piece.rotation)
    shape.forEach(block => {
      const x = piece.x + block[0]
      const y = piece.y + block[1]
      drawBlock(x, y, piece.z, playerColors[piece.player])
      const groundZ = findGroundZ(x, y) + 1
      drawBlock(x, y, groundZ, null, 'white')
    })
  })
}

function drawCannons(cannons) {
  cannons.forEach(cannon => {
    ctx.fillStyle = playerColors[cannon.player]
    ctx.strokeStyle = playerColors[cannon.player]
    drawText('🔫', cannon.cannonX, cannon.cannonY, cannon.cannonZ)
  })
}

function drawCrosshairs(cannons, readyToShoot) {
  cannons.forEach(cannon => {
    // ctx.fillStyle = playerColors[cannon.player]
    // const {
    //   xCanvas,
    //   yCanvas,
    //   xSize,
    //   ySize,
    //   xOffset,
    //   yOffset,
    // } = get2DProjection(cannon.x, cannon.y, cannon.z)
    //
    // ctx.fillText(
    //   cannon.timer > 0 ? cannon.timer : '',
    //   xCanvas + (xSize + xOffset) / 2,
    //   yCanvas + CROSSHAIR_RADIUS * 2 - xOffset / 2
    // )
    //
    // ctx.strokeStyle = playerColors[cannon.player]
    // ctx.lineWidth = readyToShoot && cannon.timer <= 0 ? 10 : 4
    // ctx.beginPath()
    // ctx.arc(
    //   xCanvas + (xSize + xOffset) / 2,
    //   yCanvas + (ySize - yOffset) / 2,
    //   CROSSHAIR_RADIUS,
    //   0,
    //   Math.PI * 2,
    //   true
    // )
    // ctx.stroke()
    //
    drawBlock(cannon.x, cannon.y, cannon.z, null, playerColors[cannon.player])
  })
}

function drawBombs(bombs) {
  bombs.forEach(bomb => {
    drawText('💣', bomb.x, bomb.y, bomb.z)
    // drawBlock(bomb.x, bomb.y, bomb.z, 'white')
  })
}

function animatePieces(pieces, map) {
  const now = getTimeNow()
  return pieces.map(piece => {
    if (now > piece.lastUpdated + piece.fallTime) {
      redraw = true
      const isSolidHit = isCollision({ ...piece, z: piece.z - 1 }, map, [
        STONE1,
        STONE2,
        STONE3,
        LAND,
      ])
      const isUnderwater = isTotalCollision(
        { ...piece, z: piece.z - 1 },
        map,
        SEA
      )
      if (isSolidHit || isUnderwater) {
        if (isSolidHit) {
          map = drawPieceOnMap(piece, map)
        }
        if (isUnderwater) {
          sprites.push(
            generateSprite(piece.x, piece.y, piece.z, '💦', SPLASH_DURATION)
          )
        }
        return generatePiece(piece.player)
      } else {
        return { ...piece, lastUpdated: now, z: piece.z - 1 }
      }
    } else {
      return piece
    }
  })
}

function animateCannons(cannons, map) {
  const now = getTimeNow()
  cannons.forEach(cannon => {
    if (
      getMapBlock(map, cannon.cannonX, cannon.cannonY, cannon.cannonZ - 1) ===
      SKY
    ) {
      cannon.cannonZ--
      redraw = true
    }
    const timer = Math.floor((cannon.lastShot + cannon.reloadTime - now) / 1000)
    if (timer !== cannon.timer) {
      redraw = true
    }
    cannon.timer = timer
  })
  return cannons
}

function getBombPosition(bomb, time) {
  const x = bomb.startX + time * bomb.xDirection
  const y = bomb.startY + time * bomb.yDirection
  const z = bomb.startZ - bomb.a * time * time - bomb.b * time
  return { x, y, z }
}

function generateSprite(x, y, z, text, duration) {
  return {
    x,
    y,
    z,
    text,
    duration,
    createdAt: getTimeNow(),
  }
}

function animateBombs(bombs, map) {
  const timeNow = getTimeNow()
  bombs.forEach(bomb => {
    const exactTime = (timeNow - bomb.createdAt) / BOMB_STEP_TIME
    const { x: exactX, y: exactY, z: exactZ } = getBombPosition(bomb, exactTime)

    redraw = true
    bomb.x = exactX
    bomb.y = exactY
    bomb.z = exactZ

    const margin = 4
    if (
      exactX < -margin ||
      exactY < -margin ||
      exactZ < -margin ||
      exactX >= width + margin ||
      exactY >= height + margin
    ) {
      bomb.exploded = true
      console.log('no collision at', bomb.x, bomb.y, bomb.z)
    } else {
      const collision = findCollision(bomb, timeNow, map)
      if (collision) {
        console.log('collision', collision)
        const { x, y, z } = collision
        const mapBlock = getMapBlock(map, x, y, z)
        console.log('with block', mapBlock)
        if (mapBlock !== SKY) {
          if (mapBlock === STONE1) {
            map[y][x][z] = STONE2
          } else if (mapBlock === STONE2) {
            map[y][x][z] = STONE3
          } else if (mapBlock === STONE3) {
            map[y][x][z] = SKY
          }
          if (mapBlock === SEA) {
            sprites.push(generateSprite(x, y, z, '💦', EXPLOSION_DURATION))
          } else {
            sprites.push(generateSprite(x, y, z, '💥', EXPLOSION_DURATION))
          }
          bomb.exploded = true
        }
      }
    }
    bomb.trajectory = bomb.trajectory.filter(point => point.time >= timeNow)
  })
  bombs = bombs.filter(bomb => !bomb.exploded)
  return bombs
}

function collapseCastles(map) {
  let shouldIterate = false
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const column = map[y][x]
      for (let z = 0; z < column.length - 1; z++) {
        if (
          getMapBlock(map, x, y, z) === SKY &&
          [STONE1, STONE2, STONE3].includes(getMapBlock(map, x, y, z + 1))
        ) {
          column[z] = column[z + 1]
          if (z + 2 < column.length) {
            column[z + 1] = SKY
          } else {
            column.pop()
          }
          shouldIterate = true
        }
      }
      while (column[column.length - 1] === undefined) {
        column.pop()
      }
    }
  }
  return shouldIterate
}

function animateSprites(sprites) {
  return sprites.filter(
    sprite => sprite.createdAt + sprite.duration > getTimeNow()
  )
}

function drawText(text, x, y, z) {
  // const dx = canvas.width / width
  // const dy = canvas.height / height
  // const { xCanvas, yCanvas } = get2DProjection(x, y, z)
  // ctx.fillText(text, xCanvas + dx / 4, yCanvas - dy / 4)
}

function drawSprites(sprites) {
  sprites.forEach(sprite => {
    drawText(sprite.text, sprite.x, sprite.y, sprite.z)
  })
}

function previewBombs(cannons) {
  if (isDebugMode) {
    cannons.forEach(cannon => {
      const bombToPreview = generateBomb(cannon)
      previewBomb(bombToPreview)
    })
  }
}

let previousTimer
let previousTimeNow = getTimeNow()
let fps = 60

function updateAnimation() {
  let timer = ''
  let isModeChanged = false
  const timeNow = getTimeNow()

  fps = (fps * 31 + 1000 / (timeNow - previousTimeNow)) / 32
  previousTimeNow = timeNow

  function setMode(newMode) {
    mode = newMode
    isModeChanged = true
    redraw = true
    modeStartTime = getTimeNow()
  }

  if (mode === WAIT_FOR_BOMBS) {
    collapseCastles(map)
    cannons = animateCannons(cannons, map)
    bombs = animateBombs(bombs, map)
    if (bombs.length === 0) {
      setMode(PREPARE_TO_BUILD)
    }
  } else if ([PREPARE_TO_SHOOT, PREPARE_TO_BUILD].includes(mode)) {
    timer = Math.floor((modeStartTime + TIME_TO_PREPARE - getTimeNow()) / 1000)
    if (mode === PREPARE_TO_BUILD) {
      collapseCastles(map)
      cannons = animateCannons(cannons, map)
      bombs = animateBombs(bombs, map)
    }
    if (timer <= 0) {
      if (mode === PREPARE_TO_BUILD) {
        pieces = []
        setMode(BUILD)
      } else {
        bombs = []
        setMode(SHOOT)
      }
    }
  } else if (mode === COLLAPSE_AFTER_BUILD) {
    timer = (modeStartTime + TIME_TO_COLLAPSE - getTimeNow()) / 1000
    if (timer <= 0) {
      const shouldIterate = collapseCastles(map)
      cannons = animateCannons(cannons, map)
      if (!shouldIterate) {
        setMode(PREPARE_TO_SHOOT)
        timer = 0
      }
      redraw = true
      modeStartTime = getTimeNow()
    }
  } else if (mode === BUILD) {
    if (pieces.length === 0) {
      pieces = [generatePiece(0), generatePiece(1)]
    }
    timer = Math.floor((modeStartTime + TIME_TO_BUILD - getTimeNow()) / 1000)
    pieces = animatePieces(pieces, map)
    collapseCastles(map)

    if (timer <= 0) {
      setMode(COLLAPSE_AFTER_BUILD)
      cannons = [generateCannon(0), generateCannon(1)]
    }
  } else if (mode === SHOOT) {
    timer = Math.floor((modeStartTime + TIME_TO_SHOOT - getTimeNow()) / 1000)

    collapseCastles(map)
    cannons = animateCannons(cannons, map)
    bombs = animateBombs(bombs, map)

    if (timer <= 0) {
      setMode(WAIT_FOR_BOMBS)
    }
  }

  sprites = animateSprites(sprites)

  if (timer !== previousTimer) {
    redraw = true
  }
  previousTimer = timer

  if (redraw) {
    drawMap(map)
    if (mode === WAIT_FOR_BOMBS) {
      drawCannons(cannons)
      drawBombs(bombs)
    } else if (mode === PREPARE_TO_BUILD) {
      drawCannons(cannons)
    } else if (mode === BUILD) {
      drawPieces(pieces)
    } else if (mode === PREPARE_TO_SHOOT) {
      drawCannons(cannons)
      drawCrosshairs(cannons, false)
      previewBombs(cannons)
    } else if (mode === SHOOT) {
      drawCannons(cannons)
      drawCrosshairs(cannons, true)
      previewBombs(cannons)
      drawBombs(bombs)
    }
    if (mode !== COLLAPSE_AFTER_BUILD && !isModeChanged) {
      ctx.fillStyle = 'white'
      ctx.fillText(mode, canvas.width / 2, 10)
      ctx.fillText(timer, canvas.width / 2, 60)
    }
    ctx.fillText(
      Math.round(fps) + ' fps',
      canvas.width - 60,
      canvas.height - 60
    )
    drawSprites(sprites)
    redraw = false

    renderer.render(scene, camera)
  }


  animationHandle = window.requestAnimationFrame(updateAnimation)
}

function isTotalCollision(piece, map, material) {
  return rotate(shapes[piece.shape], piece.rotation).every(
    block =>
      getMapBlock(map, piece.x + +block[0], piece.y + block[1], piece.z) ===
      material
  )
}

function isCollision(piece, map, materials) {
  return rotate(shapes[piece.shape], piece.rotation).some(block =>
    materials.includes(
      getMapBlock(map, piece.x + +block[0], piece.y + block[1], piece.z)
    )
  )
}

function drawPieceOnMap(piece, map) {
  rotate(shapes[piece.shape], piece.rotation).forEach(block => {
    const column = map[piece.y + block[1]][piece.x + block[0]]
    for (let z = column.length; z < piece.z; z++) {
      column[z] = SKY
    }
    column[piece.z] = STONE1
  })
  return map
}

function movePieces(player, x, y) {
  pieces.forEach(piece => {
    if (piece.player === player) {
      if (
        !isCollision(
          { ...piece, x: piece.x + x, y: piece.y + y, z: piece.z },
          map,
          [STONE1, STONE2, STONE3, LAND]
        )
      ) {
        piece.x += x
        piece.y += y
      }
    }
  })
  redraw = true
}

function moveCrosshair(player, x, y, z = 0) {
  cannons.forEach(cannon => {
    if (
      cannon.player === player &&
      cannon.x + x >= 0 &&
      cannon.x + x < width &&
      cannon.y + y >= 0 &&
      cannon.y + y < height
    ) {
      cannon.x += x
      cannon.y += y
      if (z !== 0) {
        cannon.z += z
      } else {
        cannon.z = findGroundZ(cannon.x, cannon.y)
      }
    }
  })
  redraw = true
}

function shootCannons(player) {
  cannons.forEach(cannon => {
    if (cannon.player === player) {
      if (cannon.timer <= 0) {
        bombs.push(generateBomb(cannon))
        cannon.lastShot = getTimeNow()
        cannon.timer = Math.floor(
          (cannon.lastShot + cannon.reloadTime - getTimeNow()) / 1000
        )
      }
    }
  })
}

function setupCanvasAndContext(canvas, ctx) {
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  ctx.font = FONT_SIZE + 'px Times New Roman'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'center'
  ctx.fillStyle = 'white'
}

function run() {
  canvas = document.getElementById('topCanvas')
  ctx = canvas.getContext('2d')
  setupCanvasAndContext(canvas, ctx)

  ctx.fillText('foo', canvas.width / 2, 10)

  camera.position.x = width / 2
  camera.position.y = -height
  camera.position.z = width / 2
  camera.rotation.x = 1

  animationHandle = window.requestAnimationFrame(updateAnimation)
}

function toggleAnimation() {
  if (animationHandle) {
    window.cancelAnimationFrame(animationHandle)
    ctx.fillText('Paused', Math.floor(canvas.width / 2), 100)
    animationHandle = null
  } else {
    animationHandle = window.requestAnimationFrame(updateAnimation)
  }
}

function dropPieces(player) {
  pieces.forEach(piece => {
    if (piece.player === player) {
      piece.fallTime = PIECE_FALL_TIME_FAST
    }
  })
}

function rotatePieces(player) {
  pieces.forEach(piece => {
    if (piece.player === player) {
      piece.rotation = (piece.rotation + 1) % 4
    }
  })
  redraw = true
}

document.onkeydown = function (e) {
  console.log('e.key', e.key)
  if (e.key === '?') {
    isDebugMode = !isDebugMode
    redraw = true
    console.log('debug mode', isDebugMode)
  }
  if (mode === BUILD) {
    switch (e.key) {
      case 'a':
        movePieces(0, -1, 0)
        break
      case 'd':
        movePieces(0, 1, 0)
        break
      case 'w':
        movePieces(0, 0, -1)
        break
      case 's':
        movePieces(0, 0, 1)
        break
      case 'Tab':
        dropPieces(0)
        break
      case 'x':
        rotatePieces(0)
        break
      case 'ArrowLeft':
        movePieces(1, -1, 0)
        break
      case 'ArrowRight':
        movePieces(1, 1, 0)
        break
      case 'ArrowUp':
        movePieces(1, 0, -1)
        break
      case 'ArrowDown':
        movePieces(1, 0, 1)
        break
      case '0':
        rotatePieces(1)
        break
      case 'Enter':
        dropPieces(1)
        break
      case 'p':
        toggleAnimation()
        break
    }
  } else if (mode === SHOOT || mode === PREPARE_TO_SHOOT) {
    switch (e.key) {
      case 'a':
        moveCrosshair(0, -1, 0)
        break
      case 'w':
        moveCrosshair(0, 0, -1)
        break
      case 'd':
        moveCrosshair(0, 1, 0)
        break
      case 's':
        moveCrosshair(0, 0, 1)
        break
      case 'x':
        moveCrosshair(0, 0, 0, -1)
        break
      case 'Tab':
        if (mode === SHOOT) {
          shootCannons(0)
        }
        break
      case 'ArrowLeft':
        moveCrosshair(1, -1, 0)
        break
      case 'ArrowUp':
        moveCrosshair(1, 0, -1)
        break
      case 'ArrowRight':
        moveCrosshair(1, 1, 0)
        break
      case 'ArrowDown':
        moveCrosshair(1, 0, 1)
        break
      case '0':
        moveCrosshair(1, 0, 0, -1)
        break
      case 'Enter':
        if (mode === SHOOT) {
          shootCannons(1)
        }
        break
      case 'p':
        toggleAnimation()
        break
    }
  }
  if (e.key === 'Tab') {
    e.preventDefault()
  }
}

window.addEventListener('load', () => {
  run()
})
