interface CarState {
  speed: number
  angle: number
}

const MAX_SPEED = 0.0002
const ACCELERATION = 0.000005
const BRAKE_FORCE = 0.00001
const FRICTION = 0.000002
const TURN_SPEED = 0.03
const DRIFT_FACTOR = 0.03

export class CarPhysics {
  private state: CarState = { speed: 0, angle: 0 }

  update(
    dx: number,
    dy: number,
    currentLng: number,
    currentLat: number,
    currentAngle: number,
  ): { lng: number; lat: number; angle: number } {
    const isMoving = dx !== 0 || dy !== 0

    if (isMoving) {
      const targetAngle = Math.atan2(dx, -dy)
      let angleDiff = targetAngle - this.state.angle
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI

      if (Math.abs(angleDiff) > 0.1) {
        this.state.angle += Math.sign(angleDiff) * TURN_SPEED
        const driftOffset = Math.sin(angleDiff) * DRIFT_FACTOR * (this.state.speed / MAX_SPEED)
        this.state.angle += driftOffset
      }
    }

    if (dy < 0) {
      this.state.speed = Math.min(this.state.speed + ACCELERATION, MAX_SPEED)
    } else if (dy > 0) {
      this.state.speed = Math.max(this.state.speed - BRAKE_FORCE, 0)
    } else {
      this.state.speed = Math.max(this.state.speed - FRICTION, 0)
    }

    const lng = currentLng + Math.sin(this.state.angle) * this.state.speed
    const lat = currentLat + Math.cos(this.state.angle) * this.state.speed

    return { lng, lat, angle: this.state.angle }
  }
}
