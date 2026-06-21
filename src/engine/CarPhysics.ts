interface CarState {
  speed: number
  angle: number
  steeringAngle: number
}

const MAX_SPEED = 0.00002
const ACCELERATION = 0.00000009
const BRAKE_FORCE = 0.0000004
const FRICTION = 0.0000001
const TURN_SPEED = 0.03
const DRIFT_FACTOR = 0.03
const STEERING_RATE = 3.0
const STEERING_RETURN_RATE = 4.0
const STEERING_MAX = 1.0
const FUEL_CONSUMPTION = 0.015

export class CarPhysics {
  private state: CarState = { speed: 0, angle: 0, steeringAngle: 0 }

  update(
    forward: number,
    rotation: number,
    dt: number,
    fuel: number,
    currentLng: number,
    currentLat: number,
    currentAngle: number,
  ): { lng: number; lat: number; angle: number; fuel: number } {
    this.state.angle = currentAngle

    if (rotation !== 0) {
      this.state.steeringAngle += rotation * STEERING_RATE * dt
      if (Math.abs(this.state.steeringAngle) > STEERING_MAX) {
        this.state.steeringAngle = Math.sign(this.state.steeringAngle) * STEERING_MAX
      }
    } else {
      if (Math.abs(this.state.steeringAngle) > 0) {
        const returnAmt = STEERING_RETURN_RATE * dt
        if (Math.abs(this.state.steeringAngle) <= returnAmt) {
          this.state.steeringAngle = 0
        } else {
          this.state.steeringAngle -= Math.sign(this.state.steeringAngle) * returnAmt
        }
      }
    }

    if (this.state.steeringAngle !== 0 && this.state.speed > MAX_SPEED * 0.1) {
      this.state.angle += this.state.steeringAngle * TURN_SPEED
      const drift = this.state.steeringAngle * DRIFT_FACTOR * (this.state.speed / MAX_SPEED)
      this.state.angle += drift
    }

    if (forward > 0 && fuel > 0) {
      this.state.speed = Math.min(this.state.speed + ACCELERATION, MAX_SPEED)
    } else if (forward < 0) {
      this.state.speed = Math.max(this.state.speed - BRAKE_FORCE, 0)
    } else {
      this.state.speed = Math.max(this.state.speed - FRICTION, 0)
    }

    if (this.state.speed > 0 && fuel > 0) {
      fuel = Math.max(fuel - FUEL_CONSUMPTION * (this.state.speed / MAX_SPEED) * dt, 0)
    }

    const lngScale = 1 / Math.cos(currentLat * Math.PI / 180)
    const lng = currentLng + Math.sin(this.state.angle) * this.state.speed * lngScale
    const lat = currentLat + Math.cos(this.state.angle) * this.state.speed

    return { lng, lat, angle: this.state.angle, fuel }
  }
}
