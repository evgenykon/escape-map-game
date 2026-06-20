interface CarState {
  speed: number
  angle: number
}

const MAX_SPEED = 0.000004
const ACCELERATION = 0.00000004
const BRAKE_FORCE = 0.00000006
const FRICTION = 0.00000002
const TURN_SPEED = 0.03
const DRIFT_FACTOR = 0.03

export class CarPhysics {
  private state: CarState = { speed: 0, angle: 0 }

  update(
    forward: number,
    rotation: number,
    currentLng: number,
    currentLat: number,
    currentAngle: number,
  ): { lng: number; lat: number; angle: number } {
    this.state.angle = currentAngle

    if (rotation !== 0 && this.state.speed > 0) {
      this.state.angle += rotation * TURN_SPEED
      const drift = rotation * DRIFT_FACTOR * (this.state.speed / MAX_SPEED)
      this.state.angle += drift
    }

    if (forward > 0) {
      this.state.speed = Math.min(this.state.speed + ACCELERATION, MAX_SPEED)
    } else if (forward < 0) {
      this.state.speed = Math.max(this.state.speed - BRAKE_FORCE, 0)
    } else {
      this.state.speed = Math.max(this.state.speed - FRICTION, 0)
    }

    const lng = currentLng + Math.sin(this.state.angle) * this.state.speed
    const lat = currentLat + Math.cos(this.state.angle) * this.state.speed

    return { lng, lat, angle: this.state.angle }
  }
}
