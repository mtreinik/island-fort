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
const TIME_TO_SHOOT = 30 * 1000
const TIME_TO_COLLAPSE = 200
const TIME_TO_PREPARE = 5 * 1000

const CROSSHAIR_RADIUS = 20

const SKY = 0
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
  return new Date().getTime()
}

let isDebugMode = false
let mode = BUILD
let modeStartTime = getTimeNow()

let sprites = []
const playerColors = ['purple', 'yellow']

const names = ['Player 1', 'Player 2']

const shapes = [
  [
    [-1, -1],
    [0, -1],
    [-1, 0],
    [0, 0],
  ],
  [
    [-3, 0],
    [-2, 0],
    [-1, 0],
    [0, 0],
  ],
  [
    [0, -1],
    [-1, 0],
    [0, 0],
    [1, 0],
  ],
]

function rotate(array, rotation) {
  switch (rotation) {
    case 0:
      return array
    case 1:
      return array.map(piece => [piece[1], -piece[0]])
    case 2:
      return array.map(piece => [-piece[0], -piece[1]])
    case 3:
      return array.map(piece => [-piece[1], piece[0]])
  }
}

function generatePiece(player) {
  return {
    player: player,
    x: player === 0 ? 9 : 40,
    y: 5,
    rotation: Math.floor(Math.random() * 4),
    shape: Math.floor(Math.random() * shapes.length),
    fallTime: PIECE_FALL_TIME_SLOW,
    lastUpdated: getTimeNow(),
  }
}

function findGroundY(x) {
  for (let y = 0; y < height; y++) {
    if (map[y][x] !== SKY) {
      return y - 1
    }
  }
  return 0
}

function generateCannon(player) {
  const cannonX = player === 0 ? 9 : 40
  return {
    player: player,
    cannonX: cannonX,
    cannonY: findGroundY(cannonX),
    x: player === 1 ? 9 : 40,
    y: 37,
    timer: 0,
    reloadTime: CANNON_RELOAD_TIME,
    lastShot: getTimeNow() - CANNON_RELOAD_TIME,
  }
}

function calculateParabola(startX, startY, endX, endY) {
  const dx = endX - startX
  const dy = endY - startY
  const a = 0.05
  const xDirection = dx > 0 ? 1 : -1
  const b = dx > 0 ? dy / dx - a * dx : a * dx - dy / dx
  return { a, b, xDirection }
}

function generateBomb(cannon) {
  const startX = cannon.cannonX
  const startY = cannon.cannonY - 1
  const endX = cannon.x
  const endY = cannon.y

  const { a, b, xDirection } = calculateParabola(startX, startY, endX, endY)

  const timeNow = getTimeNow()
  const trajectory = calculateTrajectory(
    timeNow,
    startX,
    startY,
    a,
    b,
    xDirection
  )

  return {
    x: startX,
    y: startY,
    startX,
    startY,
    xDirection,
    a,
    b,
    endX,
    endY,
    trajectory,
    createdAt: timeNow,
  }
}

function calculateTrajectory(startTime, startX, startY, a, b, xDirection) {
  let time = BOMB_STEP_TIME
  let x = startX
  let y = startY
  const trajectory = []
  let len = 100
  while (x >= 0 && x < width && y < height && len-- > 0) {
    const { x: nextX, y: nextY } = getBombPosition(
      { startX, startY, a, b, xDirection },
      time / BOMB_STEP_TIME
    )
    time += BOMB_STEP_TIME
    while (
      Math.round(x) !== Math.round(nextX) ||
      Math.round(y) !== Math.round(nextY)
    ) {
      const dx = nextX - x
      const dy = nextY - y
      const sx = dx > 0 ? 1 : -1
      const sy = dy > 0 ? 1 : -1

      const isRising = dy > 0
      let isHorizontal = false
      if (Math.abs(dx) > 0) {
        x += sx
        isHorizontal = true
      } else {
        y += sy
      }
      trajectory.push({
        x: x,
        y: Math.round(y),
        time: time + startTime,
        isHorizontal,
        isRising,
      })
    }
  }
  return trajectory
}

function findCollision(bomb, time, map) {
  const timeNow = getTimeNow()
  const passedPoints = bomb.trajectory.filter(point => point.time < timeNow)
  return passedPoints.find(point => map[point.y][point.x] !== SKY)
}

// used in debug mode to visualize trajectory
function previewBomb(bomb) {
  const dx = canvas.width / width
  const dy = canvas.height / height
  ctx.lineWidth = 2
  ctx.strokeStyle = 'white'
  ctx.beginPath()
  ctx.moveTo(
    bomb.trajectory[0].x * dx + dx / 2,
    bomb.trajectory[0].y * dy + dy / 2
  )
  bomb.trajectory.forEach(point => {
    const x = point.x * dx + dx / 2
    const y = point.y * dy + dy / 2
    ctx.lineTo(x, y)
  })
  ctx.stroke()

  bomb.trajectory.forEach(point => {
    if (point.isRising) {
      if (point.isHorizontal) {
        ctx.strokeStyle = 'red'
      } else {
        ctx.strokeStyle = 'purple'
      }
    } else {
      if (point.isHorizontal) {
        ctx.strokeStyle = 'blue'
      } else {
        ctx.strokeStyle = 'cyan'
      }
    }
    const x = point.x * dx + dx / 2
    const y = point.y * dy + dy / 2
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, Math.PI * 2, true)
    ctx.stroke()
  })
}

const map = generateMap()
let pieces = [generatePiece(0), generatePiece(1)]
let cannons = [generateCannon(0), generateCannon(1)]
let bombs = []

function generateMap() {
  const map = []
  for (let y = 0; y < height; y++) {
    const row = []
    for (let x = 0; x < width; x++) {
      row[x] = y <= (height * 8) / 10 ? SKY : SEA
    }
    map[y] = row
  }

  const landY = Math.floor((height * 8) / 10)
  for (let i = 0; i < width / 4; i++) {
    map[landY][i + Math.floor(width / 16)] = LAND
    map[landY][i + Math.floor((width * 11) / 16)] = LAND
  }
  for (let i = 0; i < width / 8; i++) {
    map[landY - 1][i + Math.floor((width * 2) / 16)] = LAND
    map[landY - 1][i + Math.floor((width * 12) / 16)] = LAND
  }

  return map
}
function drawBlock(x, y, color) {
  const dx = canvas.width / width
  const dy = canvas.height / height
  ctx.fillStyle = color
  ctx.fillRect(x * dx, y * dy, dx, dy)
}

function drawMap(map) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (map[y][x] !== SKY) {
        const color = blockColors[map[y][x]]
        drawBlock(x, y, color)
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
      drawBlock(
        piece.x + block[0],
        piece.y + block[1],
        playerColors[piece.player]
      )
    })
  })
}

function drawCannons(cannons) {
  const dx = canvas.width / width
  const dy = canvas.height / height
  cannons.forEach(cannon => {
    ctx.fillStyle = playerColors[cannon.player]
    ctx.strokeStyle = playerColors[cannon.player]
    ctx.fillText('🔫', cannon.cannonX * dx + dx / 2, cannon.cannonY * dy)
  })
}

function drawCrosshairs(cannons, readyToShoot) {
  const dx = canvas.width / width
  const dy = canvas.height / height
  const halfDx = Math.floor(dx / 2)
  const halfDy = Math.floor(dy / 2)
  cannons.forEach(cannon => {
    ctx.fillStyle = playerColors[cannon.player]
    ctx.fillText(
      cannon.timer > 0 ? cannon.timer : '',
      cannon.x * dx + CROSSHAIR_RADIUS * 2,
      cannon.y * dy
    )

    ctx.strokeStyle = playerColors[cannon.player]
    ctx.lineWidth = readyToShoot && cannon.timer <= 0 ? 10 : 4
    ctx.beginPath()
    ctx.arc(
      cannon.x * dx + halfDx,
      cannon.y * dy + halfDy,
      CROSSHAIR_RADIUS,
      0,
      Math.PI * 2,
      true
    )
    ctx.stroke()
  })
}

function drawBombs(bombs) {
  const dx = canvas.width / width
  const dy = canvas.height / height
  bombs.forEach(bomb => {
    const x = bomb.x * dx + dx / 2
    const y = bomb.y * dy
    // drawBlock(Math.round(bomb.x), Math.round(bomb.y), 'black')
    ctx.fillText('💣', x, y)
  })
}

function animatePieces(pieces, map) {
  const now = getTimeNow()
  return pieces.map(piece => {
    if (now > piece.lastUpdated + piece.fallTime) {
      redraw = true
      const isSolidHit = isCollision({ ...piece, y: piece.y + 1 }, map, [
        STONE1,
        STONE2,
        STONE3,
        LAND,
      ])
      const isUnderwater = isTotalCollision(
        { ...piece, y: piece.y + 1 },
        map,
        SEA
      )
      if (isSolidHit || isUnderwater) {
        if (isSolidHit) {
          map = drawPieceOnMap(piece, map)
        }
        if (isUnderwater) {
          sprites.push(generateSprite(piece.x, piece.y, '💦', SPLASH_DURATION))
        }
        return generatePiece(piece.player)
      } else {
        return { ...piece, lastUpdated: now, y: piece.y + 1 }
      }
    } else {
      return piece
    }
  })
}

function animateCannons(cannons, map) {
  const now = getTimeNow()
  cannons.forEach(cannon => {
    if (map[cannon.cannonY + 1][cannon.cannonX] === SKY) {
      cannon.cannonY++
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
  const y = bomb.startY + bomb.a * time * time + bomb.b * time
  return { x, y }
}

function generateSprite(x, y, text, duration) {
  return {
    x,
    y,
    text,
    duration,
    createdAt: getTimeNow(),
  }
}

function animateBombs(bombs, map) {
  const timeNow = getTimeNow()
  bombs.forEach(bomb => {
    const exactTime = (timeNow - bomb.createdAt) / BOMB_STEP_TIME
    const { x: exactX, y: exactY } = getBombPosition(bomb, exactTime)

    redraw = true
    bomb.x = exactX
    bomb.y = exactY

    if (exactX < 0 || exactY < 0 || exactX >= width || exactY >= height) {
      bomb.exploded = true
    } else {
      const collision = findCollision(bomb, timeNow, map)
      if (collision) {
        const { x, y } = collision
        if (map[y][x] !== SKY) {
          if (map[y][x] === STONE1) {
            map[y][x] = STONE2
          } else if (map[y][x] === STONE2) {
            map[y][x] = STONE3
          } else if (map[y][x] === STONE3) {
            map[y][x] = SKY
          }
          sprites.push(generateSprite(x, y, '💥', EXPLOSION_DURATION))
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
    for (let y = height - 1; y > 0; y--) {
      if (map[y][x] === SKY && [STONE1, STONE2, STONE3].includes(map[y - 1][x])) {
        map[y][x] = map[y - 1][x]
        map[y - 1][x] = SKY
        shouldIterate = true
      }
    }
  }
  return shouldIterate
}

function setMode(newMode) {
  mode = newMode
  redraw = true
  modeStartTime = getTimeNow()
}

function animateSprites(sprites) {
  return sprites.filter(
    sprite => sprite.createdAt + sprite.duration > getTimeNow()
  )
}

function drawSprites(sprites) {
  const dx = canvas.width / width
  const dy = canvas.height / height
  sprites.forEach(sprite => {
    ctx.fillText(sprite.text, sprite.x * dx + dx / 2, sprite.y * dy)
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
function updateAnimation() {
  let timer = ''
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
    if (timer < 0) {
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
    if (timer < 0) {
      const shouldIterate = collapseCastles(map)
      cannons = animateCannons(cannons, map)
      if (!shouldIterate) {
        setMode(PREPARE_TO_SHOOT)
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

    if (timer < 0) {
      setMode(COLLAPSE_AFTER_BUILD)
      cannons = [generateCannon(0), generateCannon(1)]
    }
  } else if (mode === SHOOT) {
    timer = Math.floor((modeStartTime + TIME_TO_SHOOT - getTimeNow()) / 1000)

    collapseCastles(map)
    cannons = animateCannons(cannons, map)
    bombs = animateBombs(bombs, map)

    if (timer < 0) {
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
    if (mode !== COLLAPSE_AFTER_BUILD) {
      ctx.fillStyle = 'white'
      ctx.fillText(mode, canvas.width / 2, 10)
      ctx.fillText(timer, canvas.width / 2, 60)
    }
    drawSprites(sprites)
    redraw = false
  }
  animationHandle = window.requestAnimationFrame(updateAnimation)
}

function isTotalCollision(piece, map, material) {
  return rotate(shapes[piece.shape], piece.rotation).every(
    block => map[piece.y + block[1]][piece.x + block[0]] === material
  )
}

function isCollision(piece, map, materials) {
  return rotate(shapes[piece.shape], piece.rotation).some(block =>
    materials.includes(map[piece.y + block[1]][piece.x + block[0]])
  )
}

function drawPieceOnMap(piece, map) {
  rotate(shapes[piece.shape], piece.rotation).forEach(block => {
    map[piece.y + block[1]][piece.x + block[0]] = STONE1
  })
  return map
}

function movePieces(player, x, y) {
  pieces.forEach(piece => {
    if (piece.player === player) {
      if (
        !isCollision({ ...piece, x: piece.x + x, y: piece.y + y }, map, [
          STONE1,
          STONE2,
          STONE3,
          LAND,
        ])
      ) {
        piece.x += x
        piece.y += y
      }
    }
  })
  redraw = true
}

function moveCrosshair(player, x, y) {
  cannons.forEach(cannon => {
    if (cannon.player === player) {
      if (cannon.x + x !== cannon.cannonX) {
        cannon.x += x
      }
      cannon.y += y
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

function run() {
  canvas = document.getElementById('canvas')
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight

  ctx = canvas.getContext('2d')
  ctx.font = FONT_SIZE + 'px Times New Roman'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'center'

  drawMap(map)
  drawPieces(pieces)

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
  }
  if (mode === BUILD) {
    switch (e.key) {
      case 'a':
        movePieces(0, -1, 0)
        break
      case 'd':
        movePieces(0, 1, 0)
        break
      case 's':
        dropPieces(0)
        break
      case 'w':
        rotatePieces(0)
        break
      case 'ArrowLeft':
        movePieces(1, -1, 0)
        break
      case 'ArrowRight':
        movePieces(1, 1, 0)
        break
      case 'ArrowUp':
        rotatePieces(1)
        break
      case 'ArrowDown':
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
